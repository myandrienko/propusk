import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { getRedis } from "../lib/redis.ts";
import { mapScriptError, script } from "../lib/script.ts";
import { unix } from "../lib/time.ts";
import { e } from "../lib/try.ts";
import {
  ChallengeRef,
  getChallengeKey,
  type Challenge,
  type ChallengeStatus,
  type PassedChallenge,
  type PendingChallenge,
} from "../models/challenge.ts";
import { SessionRef } from "../models/session.ts";
import { UserRef, type User } from "../models/user.ts";
import { createSession } from "./session.ts";

export interface CreateChallengeInit {
  clientHints?: string;
}

export interface CreateChallengeResult {
  ref: ChallengeRef;
  challenge: PendingChallenge;
}

export interface ReadChallengeResult {
  ref: ChallengeRef;
  challenge: PendingChallenge;
}

export type ConsumeChallengeResult =
  | PendingConsumeChallengeResult
  | SuccesfulConsumeChallengeResult;

export interface PassChallengeResult {
  challenge: PassedChallenge;
  provisionalSessionRef: SessionRef;
}

export async function createChallenge(
  init: CreateChallengeInit = {},
): Promise<CreateChallengeResult> {
  const redis = getRedis();
  const exat = unix() + 10 * 60; // 10 minutes
  const ref = new ChallengeRef(exat, ChallengeRef.provision());
  const key = getChallengeKey(ref.code);

  const challenge: Challenge = {
    id: ref.id,
    clientHints: init.clientHints,
    status: "pending",
  };

  const res = await redis.set(key, challenge, { nx: true, exat });

  if (!res) {
    throw new ConflictError("Challenge code already in use");
  }

  return { ref, challenge };
}

export async function readChallenge(
  code: string,
): Promise<ReadChallengeResult> {
  const redis = getRedis();
  const key = getChallengeKey(code);
  const trans = redis.multi().get<Challenge>(key).ttl(key).time();
  const [challenge, ttl, [time]] = await trans.exec();

  if (!challenge || challenge.status === "passed") {
    throw new NotFoundError("Challenge not found");
  }

  const exat = time + ttl;
  const ref = new ChallengeRef(exat, challenge.id);
  return { ref, challenge };
}

export async function tryConsumeChallenge(
  ref: ChallengeRef,
): Promise<ConsumeChallengeResult> {
  const key = getChallengeKey(ref.code);

  const challenge = await e.try(
    () => doConsumeChallenge([key], ref.id),
    (err) => mapScriptError(err, { notFound: "Challenge not found" }),
  );

  if (!challenge) {
    return { status: "pending" };
  }

  const tokens = await createSession({
    // Sessions inherit id from challenge. This makes tracing easier. It's also
    // useful for signing out using provisional session token: deleting both
    // challenge and session using the same id ensures session is either
    // deleted or will not be created.
    sessionId: challenge.id,
    user: challenge.user,
    clientHints: challenge.clientHints,
  });

  return { status: "passed", ...tokens };
}

export async function passChallenge(
  ref: ChallengeRef,
  user: User,
): Promise<PassChallengeResult> {
  const key = getChallengeKey(ref.code);

  const challenge = await e.try(
    () => doPassChallenge([key], ref.id, JSON.stringify(user)),
    (err) =>
      mapScriptError(err, {
        notFound: "Challenge not found",
        conflict: "Challenge already passed",
      }),
  );

  const provisionalSessionRef = new SessionRef(user.tgId, ref.id);
  return { challenge, provisionalSessionRef };
}

export async function deleteChallenge(ref: ChallengeRef): Promise<void> {
  const key = getChallengeKey(ref.code);

  await e.try(
    () => doDeleteChallenge([key], ref.id),
    (err) => mapScriptError(err, { notFound: "Challenge not found" }),
  );
}

// Private

interface BaseConsumeChallengeResult {
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

/**
 * Resuable script part that expects KEYS[1] to be challenge key, and ARGV[1]
 * to be challenge id. Reads challenge, checks id, and fails with NOTFOUND if
 * challenge is not found or id doesn't match.
 */
const ensureChallenge = (localName: string) => `
local ${localName}_json = redis.call('GET', KEYS[1])
if not ${localName}_json then
  return redis.error_reply('NOTFOUND Challenge code not found')
end

local ${localName} = cjson.decode(${localName}_json)
if ${localName}.id ~= ARGV[1] then
  return redis.error_reply('NOTFOUND Challenge id mismatch')
end
`;

const doConsumeChallenge = script<(id: string) => PassedChallenge | null>`
${ensureChallenge("challenge")}

if challenge.status ~= 'passed' then
  return nil
end

redis.call('DEL', KEYS[1])
return challenge_json
`;

const doPassChallenge = script<(id: string, user: string) => PassedChallenge>`
${ensureChallenge("challenge")}

if challenge.status ~= 'pending' then
  return redis.error_reply('CONFLICT Challenge already passed')
end

challenge.status = 'passed'
challenge.user = cjson.decode(ARGV[2])
local json = cjson.encode(challenge)
redis.call('SET', KEYS[1], json, 'KEEPTTL')
return json
`;

const doDeleteChallenge = script<(id: string) => "OK">`
${ensureChallenge("challenge")}
redis.call('DEL', KEYS[1])
return redis.status_reply("OK")
`;
