import {
  ChallengeRef,
  getChallengeKey,
  type Challenge,
  type ChallengeStatus,
} from "../models/challenge.ts";
import type { User } from "../models/user.ts";
import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { getRedis } from "../lib/redis.ts";
import { script } from "../lib/script.ts";
import { unix } from "../lib/time.ts";

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
  const key = getChallengeKey(ref.code);
  const exat = unix() + 10 * 60; // 10 minutes

  const challenge: Challenge = {
    id: ref.id,
    clientHints: init.clientHints,
    status: "pending",
    exat,
  };

  const res = await redis.set<Challenge>(key, challenge, {
    nx: true,
    exat,
  });

  if (!res) {
    throw new ChallengeConflictError("Challenge code already in use");
  }

  return {
    code: ref.code,
    token: ref.getToken(exat),
    mnemonic: ref.getMnemonic(),
  };
}

export async function readChallenge(
  code: string,
): Promise<ReadChallengeResult> {
  const redis = getRedis();
  const key = getChallengeKey(code);
  const res = await redis.get<Challenge>(key);

  if (!res || res.status === "passed") {
    throw new ChallengeNotFoundError("Challenge not found");
  }

  const ref = new ChallengeRef(res.id);

  return {
    token: ref.getToken(res.exat),
    mnemonic: ref.getMnemonic(),
    clientHints: res.clientHints,
  };
}

export async function tryConsumeChallenge(
  token: string,
): Promise<ConsumeChallengeResult> {
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);
  const res = await doConsumeChallenge([key], ref.id);

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
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);

  try {
    await doPassChallenge([key], ref.id, JSON.stringify(user));
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
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);

  try {
    await doDeleteChallenge([key], ref.id);
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
