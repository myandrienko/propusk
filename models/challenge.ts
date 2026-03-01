import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import { codec } from "../lib/codec.ts";
import { UnauthorizedError } from "../lib/errors.ts";
import { seal, unseal } from "../lib/seal.ts";
import type { User } from "./user.ts";

export type Challenge = PendingChallenge | PassedChallenge;
export type ChallengeStatus = "pending" | "passed";

export interface PendingChallenge extends BaseChallenge {
  status: "pending";
}

export interface PassedChallenge extends BaseChallenge {
  status: "passed";
  user: User;
}

const codeLength = 8;
const randomnessLength = 16;

export class ChallengeRef {
  static readonly format = [`${codeLength + randomnessLength}b64`] as const;
  readonly exat: number;
  readonly id: string;
  readonly code: string;
  readonly #asBytes: () => Uint8Array;

  /**
   * Challenge ID is constructed as a random 8-character alphanumeric code (used
   * for manual entry and lookups) followed by 16 additional random base64url
   * characters.
   */
  static provision(): string {
    const code = generateCode();
    const randomness = generateRandomness();
    return `${code}${randomness}`;
  }

  static fromToken(token: string): ChallengeRef {
    return new ChallengeRef(...unseal(token, { expires: true }));
  }

  constructor(exat: number, ...args: [id: string] | [payload: Uint8Array]) {
    this.exat = exat;
    [this.id, this.#asBytes] = codec(ChallengeRef.format, ...args);
    this.code = this.id.slice(0, codeLength);
  }

  getToken() {
    return seal(this.#asBytes(), { exat: this.exat });
  }

  getMnemonic() {
    // Length of entropy for BIP39 must be a multiple of 4:
    const entropyLength = Math.trunc(this.#asBytes().length / 4) * 4;
    const entropy = this.#asBytes().slice(0, entropyLength);
    return bip39.entropyToMnemonic(entropy, wordlist);
  }
}

export function getChallengeKey(id: string): string {
  return `challenge:${id.slice(0, codeLength)}`;
}

export function isValidChallengeCode(maybeCode: string): boolean {
  const pattern = new RegExp(`^[A-Za-z0-9]{${codeLength}}$`);
  return pattern.test(maybeCode);
}

// Private

interface BaseChallenge {
  id: string;
  clientHints?: string;
  status: ChallengeStatus;
}

const alphanumAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateCode = customAlphabet(alphanumAlphabet, codeLength);
const generateRandomness = customAlphabet(urlAlphabet, randomnessLength);
