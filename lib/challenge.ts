import { base64urlnopad } from "@scure/base";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import { envHex } from "./env.ts";
import { getRedis } from "./redis.ts";
import { createScript } from "./script.ts";
import { sealedValueEx } from "./seal.ts";
import { unix } from "./time.ts";

export interface Challenge {
  code: string;
  token: string;
  mnemonic: string;
  status: ChallengeStatus;
}

export async function createChallenge(): Promise<Challenge> {
  const redis = getRedis();
  const { code, id } = generateId();
  const exat = unix() + 10 * 60; // 10 minutes
  const status: ChallengeStatus = "pending";

  const res = await redis.set<ChallengeRecord>(
    `challenge:${code}`,
    { id, status },
    { nx: true, exat },
  );

  if (!res) {
    throw new ChallengeConflictError("Challenge code already in use");
  }

  const { token, mnemonic } = generateTokens(id, exat);
  return { code, token, mnemonic, status };
}

export async function tryConsumeChallenge(token: string) {
  const { code, id } = parseToken(token);
  const res = await consumeChallenge([`challenge:${code}`], id);
  return res;
}

export class ChallengeConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeConflictError";
  }
}

// Private

interface ChallengeRecord {
  id: string;
  status: ChallengeStatus;
}

type ChallengeStatus = "pending";

const codeLength = 8;
const generateCode = customAlphabet(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  codeLength,
);
const generateRandomness = customAlphabet(urlAlphabet, 16);

/**
 * Challenge ID is constructed as a random 8-character alphanumeric code (used
 * for manual entry and lookups) followed by 16 additional random base64url
 * characters.
 */
function generateId(): {
  code: string;
  id: string;
} {
  const code = generateCode();
  const id = `${code}${generateRandomness()}`;
  return { code, id };
}

/**
 * Given a challenge ID, decodes it from base64url, then generates
 * the following values:
 * - token: sealed value with an expiration timestamp of `exat`;
 * - mnemonic: human-readable representation of the ID, generated using
 *   the BIP39 algorithm from the first 128 bits of the payload.
 */
function generateTokens(
  id: string,
  exat: number,
): {
  token: string;
  mnemonic: string;
} {
  const payload = base64urlnopad.decode(id);
  const token = sealedValueEx(envHex("SEAL_KEY")).seal(payload, { exat });
  // Length of entropy for BIP39 must be a multiple of 32 bits:
  const entropy = payload.slice(0, Math.trunc(payload.length / 4) * 4);
  const mnemonic = bip39.entropyToMnemonic(entropy, wordlist);
  return { token, mnemonic };
}

function parseToken(token: string): {
  code: string;
  id: string;
} {
  const payload = sealedValueEx(envHex("SEAL_KEY")).unseal(token);
  const id = base64urlnopad.encode(payload);
  const code = id.slice(0, codeLength);
  return { code, id };
}

const consumeChallenge = createScript<(id: string) => 0 | 1>(`
local data = redis.call('GET', KEYS[1])
if not data then
  return {err = 'NOT_FOUND'}
end

local challenge = cjson.decode(data)
if challenge.id ~= ARGV[1] then
  return {err = 'NOT_FOUND'}
end

if challenge.status ~= 'passed' then
  return 0
end

redis.call('DEL', KEYS[1])
return 1
`);
