import { getRedis } from "../lib/redis.ts";
import { unix } from "../lib/time.ts";
import { getSessionKey, SessionRef, type Session } from "../models/session.ts";
import type { User } from "../models/user.ts";
import { RefreshNonce } from "../models/refresh.ts";
import { SignJWT } from "jose";
import { env } from "../lib/env.ts";
import { script } from "../lib/script.ts";
import { e } from "../lib/try.ts";
import { NotFoundError, ConflictError } from "../lib/errors.ts";

export interface CreateSessionInit {
  sessionId?: string;
  user: User;
  clientHints?: string;
}

export interface CreateSessionResult {
  accessToken: string;
  refreshToken: string;
}

export async function createSession(
  init: CreateSessionInit,
): Promise<CreateSessionResult> {
  const redis = getRedis();
  const sessionId = init.sessionId ?? SessionRef.provision();
  const key = getSessionKey(init.user.id, sessionId);
  const exat = unix() + refreshTokenTtl;

  const refresh = new RefreshNonce(
    init.user.id,
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
    accessToken: await signAccessToken(init.user),
    refreshToken: refresh.getToken({ exat }),
  };
}

export async function refreshSession(
  token: string,
): Promise<CreateSessionResult> {
  const ref = RefreshNonce.fromToken(token);
  const key = getSessionKey(ref.userId, ref.sessionId);
  const nextNonce = RefreshNonce.provision();
  const nextExat = unix() + refreshTokenTtl;

  const session = await e.try(
    () => doRefreshSession([key], ref.nonce, nextNonce, refreshTokenTtl),
    (err) => {
      if (err instanceof Error) {
        if (err.message.includes("NOT_FOUND")) {
          return new NotFoundError("Session not found");
        }

        if (err.message.includes("CONFLICT")) {
          return new ConflictError("Refresh token already used");
        }
      }
    },
  );

  const refresh = new RefreshNonce(ref.userId, ref.sessionId, nextNonce);

  return {
    accessToken: await signAccessToken(session.user),
    refreshToken: refresh.getToken({ exat: nextExat }),
  };
}

// Private

interface AccessTokenJwtPayload {
  iss: "propusk";
  sub: string;
  exp: number;
  name: string;
  lang: string;
  image?: string;
}

const refreshTokenTtl = 90 * 24 * 60 * 60; // 30 days
const accessTokenTtl = 60; // 1 minute

function signAccessToken(user: User) {
  const exat = unix() + accessTokenTtl;

  return new SignJWT({
    iss: "propusk",
    sub: user.id,
    exp: exat,
    name: user.name,
    lang: user.lang,
    image: user.image,
  } satisfies AccessTokenJwtPayload).sign(getJwtSecret());
}

function getJwtSecret() {
  return env.JWT_SECRET.hex(32);
}

const doRefreshSession = script<
  (nonce: string, nextNonce: string, nextExat: number) => Session
>`
local data = redis.call('GET', KEYS[1])
if not data then
  return redis.error_reply('NOT_FOUND')
end

local session = cjson.decode(data)
if session.nonce ~= ARGV[1] then
  return redis.error_reply('CONFLICT')
end

session.nonce = ARGV[2]
local json = cjson.encode(session)
redis.call('SET', KEYS[1], json, 'EX', ARGV[3])
return json
`;
