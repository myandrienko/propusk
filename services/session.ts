import { jwtVerify, SignJWT } from "jose";
import { env } from "../lib/env.ts";
import { NotFoundError } from "../lib/errors.ts";
import { getRedis } from "../lib/redis.ts";
import { mapScriptError, script } from "../lib/script.ts";
import { unix } from "../lib/time.ts";
import { e } from "../lib/try.ts";
import { getChallengeKey } from "../models/challenge.ts";
import { RefreshNonce } from "../models/refresh.ts";
import { getSessionKey, SessionRef, type Session } from "../models/session.ts";
import type { User, UserRef } from "../models/user.ts";

export interface CreateSessionInit {
  sessionId?: string;
  user: User;
  clientHints?: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AccessTokenJwtPayload {
  iss: "propusk";
  sub: string;
  exp: number;
  name: string;
  lang: string;
  image?: string;
}

export async function createSession(
  init: CreateSessionInit,
): Promise<SessionTokens> {
  const redis = getRedis();
  const sessionId = init.sessionId ?? SessionRef.provision();
  const key = getSessionKey(init.user.tgId, sessionId);
  const exat = unix() + refreshTokenTtl;

  const refresh = new RefreshNonce(
    exat,
    init.user.tgId,
    sessionId,
    RefreshNonce.provision(),
  );

  const session: Session = {
    user: init.user,
    clientHints: init.clientHints,
    createdAt: unix(),
    nonce: refresh.nonce,
  };

  await redis.set(key, session, { exat });

  return {
    accessToken: await signAccessToken(refresh.sessionRef.userRef, init.user),
    refreshToken: refresh.getToken(),
  };
}

export async function refreshSession(
  refresh: RefreshNonce,
): Promise<SessionTokens> {
  const userTgId = refresh.sessionRef.userRef.tgId;
  const sessionId = refresh.sessionRef.id;
  const key = getSessionKey(userTgId, sessionId);
  const nextNonce = RefreshNonce.provision();
  const nextExat = unix() + refreshTokenTtl;

  const session = await e.try(
    () => doRefreshSession([key], refresh.nonce, nextNonce, refreshTokenTtl),
    (err) =>
      mapScriptError(err, {
        notFound: "Session not found",
        conflict: "Refresh token already used",
      }),
  );

  const nextRefresh = new RefreshNonce(
    nextExat,
    userTgId,
    sessionId,
    nextNonce,
  );

  return {
    accessToken: await signAccessToken(
      refresh.sessionRef.userRef,
      session.user,
    ),
    refreshToken: nextRefresh.getToken(),
  };
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenJwtPayload> {
  const { payload } = await jwtVerify<AccessTokenJwtPayload>(
    token,
    getJwtSecret(),
  );
  return payload;
}

export async function listSessions(userRef: UserRef): Promise<Session[]> {
  const redis = getRedis();
  const pattern = getSessionKey(userRef.tgId, "*");
  const keys: string[] = [];

  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, { match: pattern });
    keys.push(...batch);
    cursor = nextCursor;
  } while (cursor !== "0");

  if (keys.length === 0) {
    return [];
  }

  const sessions = await redis.mget<(Session | null)[]>(...keys);
  return sessions.filter((v): v is Session => v !== null);
}

export async function deleteSession(ref: SessionRef): Promise<void> {
  // Session could have been provisional, i.e. session token was generated
  // when the challenge had been passed, but hasn't been consumed yet.
  // To cover this case, we try deleting both the session and the challenge:
  const sessionKey = getSessionKey(ref.userRef.tgId, ref.id);
  const challengeKey = getChallengeKey(ref.id);
  const res = await getRedis().del(sessionKey, challengeKey);

  if (res === 0) {
    throw new NotFoundError("Session and provisional session not found");
  }
}

// Private

const refreshTokenTtl = 90 * 24 * 60 * 60; // 30 days
const accessTokenTtl = 60; // 1 minute

function signAccessToken(ref: UserRef, user: User) {
  const exat = unix() + accessTokenTtl;

  return new SignJWT({
    iss: "propusk",
    sub: ref.id,
    exp: exat,
    name: user.name,
    lang: user.lang,
    image: user.image,
  } satisfies AccessTokenJwtPayload)
    .setProtectedHeader({ alg: "HS256" })
    .sign(getJwtSecret());
}

function getJwtSecret() {
  return env.JWT_SECRET.hex(32);
}

const doRefreshSession = script<
  (nonce: string, nextNonce: string, nextExat: number) => Session
>`
local session_json = redis.call('GET', KEYS[1])
if not session_json then
  return redis.error_reply('NOTFOUND Session not found')
end

local session = cjson.decode(session_json)
if session.nonce ~= ARGV[1] then
  return redis.error_reply('CONFLICT Refresh token already used')
end

session.nonce = ARGV[2]
local json = cjson.encode(session)
redis.call('SET', KEYS[1], json, 'EX', ARGV[3])
return json
`;
