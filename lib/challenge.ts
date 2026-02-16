import { base64urlnopad } from "@scure/base";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import { envHex } from "./env.ts";
import { sealedValueEx } from "./seal.ts";
import { unix } from "./time.ts";
import { getClient } from "./upstash.ts";

export interface Challenge {
  code: string;
  token: string;
  mnemonic: string;
  status: ChallengeStatus;
}

export async function createChallenge(): Promise<Challenge> {
  const redis = getClient();
  const { code, id } = generateId();
  const { token, mnemonic, exat } = generateTokens(id);
  const status: ChallengeStatus = "pending";

  const res = await redis.set<ChallengeRecord>(
    `challenge:${code}`,
    { id, status },
    { nx: true, exat },
  );

  if (!res) {
    throw new ChallengeConflictError("Challenge code already in use");
  }

  return { code, token, mnemonic, status };
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

function generateId(): { code: string; id: string } {
  const code = generateCode();
  const id = `${code}${generateRandomness()}`;
  return { code, id };
}

function generateTokens(id: string): {
  token: string;
  mnemonic: string;
  exat: number;
} {
  const payload = base64urlnopad.decode(id);
  const exat = unix() + 10 * 60; // 10 minutes
  const token = sealedValueEx(envHex("SEAL_KEY")).seal(payload, { exat });
  const mnemonic = bip39.entropyToMnemonic(payload.slice(0, 16), wordlist);
  return { token, mnemonic, exat };
}

function parseChallengeId(id: string): [code: string, id: string] {
  return [id.slice(0, codeLength), id];
}
