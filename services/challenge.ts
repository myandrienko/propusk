import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { getRedis } from "../lib/redis.ts";
import { script } from "../lib/script.ts";
import { unix } from "../lib/time.ts";
import { e } from "../lib/try.ts";
import {
  ChallengeRef,
  getChallengeKey,
  type Challenge,
  type ChallengeStatus,
  type PassedChallenge,
} from "../models/challenge.ts";
import { SessionRef } from "../models/session.ts";
import { type User } from "../models/user.ts";
import { createSession } from "./session.ts";

export interface CreateChallengeInit {
  clientHints?: string;
}

export interface CreateChallengeResult {
  token: string;
  code: string;
  mnemonic: string;
  clientHints?: string;
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
  clientHints?: string;
  provisionalSessionToken: string;
}

export async function createChallenge(
  init: CreateChallengeInit = {},
): Promise<CreateChallengeResult> {
  const redis = getRedis();
  const ref = new ChallengeRef(ChallengeRef.provision());
  const key = getChallengeKey(ref.code);
  const exat = unix() + 10 * 60; // 10 minutes

  const challenge: Challenge = {
    id: ref.id,
    clientHints: init.clientHints,
    status: "pending",
  };

  const res = await redis.set(key, challenge, {
    nx: true,
    exat,
  });

  if (!res) {
    throw new ConflictError("Challenge code already in use");
  }

  return {
    token: ref.getToken({ exat }),
    code: ref.code,
    mnemonic: ref.getMnemonic(),
    clientHints: challenge.clientHints,
  };
}

export async function readChallenge(
  code: string,
): Promise<ReadChallengeResult> {
  const redis = getRedis();
  const key = getChallengeKey(code);
  const trans = redis.multi().get<Challenge>(key).ttl(key).time();
  const [res, ttl, [time]] = await trans.exec();

  if (!res || res.status === "passed") {
    throw new NotFoundError("Challenge not found");
  }

  const ref = new ChallengeRef(res.id);

  return {
    // TODO: Upstash SDK doesn't implement EXPIRETIME
    token: ref.getToken({ exat: time + ttl }),
    mnemonic: ref.getMnemonic(),
    clientHints: res.clientHints,
  };
}

export async function tryConsumeChallenge(
  token: string,
): Promise<ConsumeChallengeResult> {
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);

  const challenge = await e.try(
    () => doConsumeChallenge([key], ref.id),
    (err) => {
      if (err instanceof Error && err.message.includes("NOT_FOUND")) {
        return new NotFoundError("Challenge not found");
      }
    },
  );

  if (!challenge) {
    return { token, status: "pending" };
  }

  const session = await createSession({
    sessionId: challenge.provisionalSessionId,
    user: challenge.user,
    clientHints: challenge.clientHints,
  });

  return {
    token,
    status: "passed",
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export async function passChallenge(
  token: string,
  user: User,
): Promise<PassChallengeResult> {
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);
  const provisionalSessionId = SessionRef.provision();

  const challenge = await e.try(
    () =>
      doPassChallenge(
        [key],
        ref.id,
        JSON.stringify(user),
        provisionalSessionId,
      ),
    (err) => {
      if (err instanceof Error) {
        if (err.message.includes("NOT_FOUND")) {
          return new NotFoundError("Challenge not found");
        }

        if (err.message.includes("CONFLICT")) {
          return new ConflictError("Challenge already passed");
        }
      }
    },
  );

  const sessionRef = new SessionRef(user.id, provisionalSessionId);

  return {
    token,
    clientHints: challenge.clientHints,
    provisionalSessionToken: sessionRef.getToken(),
  };
}

export async function deleteChallenge(token: string) {
  const ref = ChallengeRef.fromToken(token);
  const key = getChallengeKey(ref.code);

  await e.try(
    () => doDeleteChallenge([key], ref.id),
    (err) => {
      if (err instanceof Error && err.message.includes("NOT_FOUND")) {
        return new NotFoundError("Challenge not found");
      }
    },
  );
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
  accessToken: string;
  refreshToken: string;
}

const doConsumeChallenge = script<(id: string) => PassedChallenge | null>`
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
return cjson.encode(challenge)
`;

const doPassChallenge = script<
  (id: string, user: string, provisionalSessionId: string) => PassedChallenge
>`
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
challenge.provisionalSessionId = ARGV[3]

local json = cjson.encode(challenge);
redis.call('SET', KEYS[1], json, 'KEEPTTL')
return json
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
