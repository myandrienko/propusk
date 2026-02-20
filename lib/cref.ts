import { base64urlnopad } from "@scure/base";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import { envHex } from "../lib/env.ts";
import { UnauthorizedError } from "../lib/errors.ts";
import {
  ExpiredSealedValueError,
  InvalidSealedValueError,
  sealedValueEx,
} from "../lib/seal.ts";
import type { User } from "./user";

export type Challenge = PendingChallenge | PassedChallenge;
export type ChallengeStatus = "pending" | "passed";

export const codeLength = 8;

export class ChallengeRef {
  readonly id: string;
  readonly code: string;

  #bytes: Uint8Array | undefined;

  static create(): ChallengeRef {
    return new ChallengeRef(generateId());
  }

  static fromToken(token: string): ChallengeRef {
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

  constructor(id: string) {
    this.id = id;
    this.code = id.slice(0, codeLength);
  }

  getToken(exat: number): string {
    return sealedValueEx(envHex("SEAL_KEY")).seal(this.bytes, { exat });
  }

  getMnemonic() {
    // Length of entropy for BIP39 must be a multiple of 32 bits:
    const entropyLength = Math.trunc(this.bytes.length / 4) * 4;
    const entropy = this.bytes.slice(0, entropyLength);
    return bip39.entropyToMnemonic(entropy, wordlist);
  }

  private get bytes(): Uint8Array {
    if (!this.#bytes) {
      this.#bytes = base64urlnopad.decode(this.id);
    }

    return this.#bytes;
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
  exat: number;
}

interface PendingChallenge extends BaseChallenge {
  status: "pending";
}

interface PassedChallenge extends BaseChallenge {
  status: "passed";
  user: User;
}

const alphanumAlphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateCode = customAlphabet(alphanumAlphabet, codeLength);
const generateRandomness = customAlphabet(urlAlphabet, 16);

/**
 * Challenge ID is constructed as a random 8-character alphanumeric code (used
 * for manual entry and lookups) followed by 16 additional random base64url
 * characters.
 */
function generateId(): string {
  const code = generateCode();
  const randomness = generateRandomness();
  return `${code}${randomness}`;
}
