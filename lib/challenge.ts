import { base64urlnopad } from "@scure/base";
import {
  ChallengeRef,
  type Challenge,
  type ChallengeStatus,
} from "../models/challenge.ts";
import type { User } from "../models/user.ts";
import { envHex } from "./env.ts";
import { ConflictError, NotFoundError, UnauthorizedError } from "./errors.ts";
import { getRedis } from "./redis.ts";
import { script } from "./script.ts";
import {
  ExpiredSealedValueError,
  InvalidSealedValueError,
  sealedValueEx,
} from "./seal.ts";
import { unix } from "./time.ts";

export interface CreateChallengeInit {
  clientHints?: string;
}

export interface CreateChallengeResult {
  code: string;
  token: string;
  mnemonic: string;
}

export interface ReadChallengeResult {
  token: string;
  mnemonic: string;
  clientHints?: string;
}

export type ConsumeChallengeResult =
  | PendingConsumeChallengeResult
  | SuccesfulConsumeChallengeResult;

export interface PassChallengeResult {
  token: string;
  status: Extract<ChallengeStatus, "passed">;
}

export async function createChallenge(
  init: CreateChallengeInit = {},
): Promise<CreateChallengeResult> {
  const redis = getRedis();
  const ref = ChallengeRef.create();
  const exat = unix() + 10 * 60; // 10 minutes

  const res = await redis.set<Challenge>(
    ref.key,
    { id: ref.id, clientHints: init.clientHints, status: "pending" },
    { nx: true, exat },
  );

  if (!res) {
    throw new ChallengeConflictError("Challenge code already in use");
  }

  return {
    code: ref.code,
    token: sealToken(ref, exat),
    mnemonic: ref.mnemonic,
  };
}

export async function readChallenge(
  token: string,
): Promise<ReadChallengeResult> {
  const redis = getRedis();
  const ref = unsealToken(token);
  const res = await redis.get<Challenge>(ref.key);

  if (!res || res.id !== ref.id || res.status === "passed") {
    throw new ChallengeNotFoundError("Challenge not found");
  }

  return {
    token,
    mnemonic: ref.mnemonic,
    clientHints: res.clientHints,
  };
}

export async function tryConsumeChallenge(
  token: string,
): Promise<ConsumeChallengeResult> {
  const ref = unsealToken(token);
  const res = await doConsumeChallenge([ref.key], ref.id);

  if (!res) {
    return { token, status: "pending" };
  }

  return {
    token,
    status: "passed",
    user: res,
  };
}

export async function passChallenge(
  token: string,
  user: User,
): Promise<PassChallengeResult> {
  const ref = unsealToken(token);

  try {
    await doPassChallenge([ref.key], ref.id, JSON.stringify(user));
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes("NOT_FOUND")) {
        throw new ChallengeNotFoundError("Challenge not found");
      }

      if (err.message.includes("CONFLICT")) {
        throw new ChallengeConflictError("Challenge already passed");
      }
    }

    throw err;
  }

  return { token, status: "passed" };
}

export async function deleteChallenge(token: string) {
  const ref = unsealToken(token);

  try {
    await doDeleteChallenge([ref.key], ref.id);
  } catch (err) {
    if (err instanceof Error && err.message.includes("NOT_FOUND")) {
      throw new ChallengeNotFoundError("Challenge not found");
    }

    throw err;
  }
}

export class ChallengeNotFoundError extends NotFoundError {
  name = "ChallengeNotFoundError";
}

export class ChallengeConflictError extends ConflictError {
  name = "ChallengeConflictError";
}

export class InvalidChallengeTokenError extends UnauthorizedError {
  name = "InvalidChallengeTokenError";
}

// Private

interface BaseConsumeChallengeResult {
  token: string;
  status: ChallengeStatus;
}

interface PendingConsumeChallengeResult extends BaseConsumeChallengeResult {
  status: "pending";
}

interface SuccesfulConsumeChallengeResult extends BaseConsumeChallengeResult {
  status: "passed";
  user: User;
}

function sealToken(ref: ChallengeRef, exat: number): string {
  return sealedValueEx(envHex("SEAL_KEY")).seal(ref.bytes, { exat });
}

function unsealToken(token: string): ChallengeRef {
  let payload: Uint8Array;

  try {
    payload = sealedValueEx(envHex("SEAL_KEY")).unseal(token);
  } catch (err) {
    if (
      err instanceof InvalidSealedValueError ||
      err instanceof ExpiredSealedValueError
    ) {
      throw new InvalidChallengeTokenError(
        "Challenge token is invalid or expired",
        { cause: err },
      );
    }

    throw err;
  }

  const id = base64urlnopad.encode(payload);
  return new ChallengeRef(id);
}

const doConsumeChallenge = script<(id: string) => User | null>`
local data = redis.call('GET', KEYS[1])
if not data then
  return redis.error_reply('NOT_FOUND')
end

local challenge = cjson.decode(data)
if challenge.id ~= ARGV[1] then
  return redis.error_reply('NOT_FOUND')
end

if challenge.status ~= 'passed' then
  return nil
end

redis.call('DEL', KEYS[1])
return cjson.encode(challenge.user)
`;

const doPassChallenge = script<(id: string, user: string) => "OK">`
local data = redis.call('GET', KEYS[1])
if not data then
  return redis.error_reply('NOT_FOUND')
end

local challenge = cjson.decode(data)
if challenge.id ~= ARGV[1] then
  return redis.error_reply('NOT_FOUND')
end

if challenge.status ~= 'pending' then
  return redis.error_reply('CONFLICT')
end

challenge.status = 'passed'
challenge.user = cjson.decode(ARGV[2])

redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
return redis.status_reply('OK')
`;

const doDeleteChallenge = script<(id: string) => "OK">`
local data = redis.call('GET', KEYS[1])
if not data then
  return redis.error_reply('NOT_FOUND')
end

local challenge = cjson.decode(data)
if challenge.id ~= ARGV[1] then
  return redis.error_reply('NOT_FOUND')
end

redis.call('DEL', KEYS[1])
return redis.status_reply('OK')
`;
