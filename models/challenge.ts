import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import * as codecs from "../lib/codecs.ts";
import { UnauthorizedError } from "../lib/errors.ts";
import { seal, unseal, type ExpirationOptions } from "../lib/seal.ts";
import type { User } from "./user.ts";

export type Challenge = PendingChallenge | PassedChallenge;
export type ChallengeStatus = "pending" | "passed";

export interface PendingChallenge extends BaseChallenge {
  status: "pending";
}

export interface PassedChallenge extends BaseChallenge {
  status: "passed";
  user: User;
  provisionalSessionId: string;
}

const codeLength = 8;
const randomnessLength = 16;

export class ChallengeRef {
  static readonly format = [codeLength + randomnessLength] as const;
  readonly id: string;
  readonly code: string;
  readonly #bytes: Uint8Array;

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
    return new ChallengeRef(unseal(token, { expires: true }));
  }

  constructor(...args: [id: string] | [payload: Uint8Array]) {
    [this.id, this.#bytes] = codecs.b64concat(ChallengeRef.format, ...args);
    this.code = this.id.slice(0, codeLength);
  }

  getToken(options: Required<ExpirationOptions>) {
    return seal(this.#bytes, options);
  }

  getMnemonic() {
    // Length of entropy for BIP39 must be a multiple of 4:
    const entropyLength = Math.trunc(this.#bytes.length / 4) * 4;
    const entropy = this.#bytes.slice(0, entropyLength);
    return bip39.entropyToMnemonic(entropy, wordlist);
  }
}

export function getChallengeKey(code: string): string {
  return `challenge:${code}`;
}

export function isValidChallengeCode(maybeCode: string): boolean {
  const pattern = new RegExp(`^[A-Za-z0-9]{${codeLength}}$`);
  return pattern.test(maybeCode);
}

export class InvalidChallengeTokenError extends UnauthorizedError {
  name = "InvalidChallengeTokenError";
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
