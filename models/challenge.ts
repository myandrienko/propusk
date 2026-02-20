import { base64urlnopad } from "@scure/base";
import { customAlphabet, urlAlphabet } from "nanoid";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { User } from "./user";

export type ChallengeSnapshot =
  | PendingChallengeSnapshot
  | PassedChallengeSnapshot;

export type ChallengeStatus = "pending" | "passed";

export class ChallengeRef {
  readonly id: string;
  readonly code: string;

  #bytes: Uint8Array | undefined;
  #mnemonic: string | undefined;

  static getKey(code: string) {
    return `challenge:${code}`;
  }

  static create(): ChallengeRef {
    return new ChallengeRef(generateId());
  }

  constructor(id: string) {
    this.id = id;
    this.code = this.id.slice(0, codeLength);
  }

  get key(): string {
    return `challenge:${this.code}`;
  }

  get bytes(): Uint8Array {
    if (!this.#bytes) {
      this.#bytes = base64urlnopad.decode(this.id);
    }

    return this.#bytes;
  }

  get mnemonic() {
    if (!this.#mnemonic) {
      // Length of entropy for BIP39 must be a multiple of 32 bits:
      const entropyLength = Math.trunc(this.bytes.length / 4) * 4;
      const entropy = this.bytes.slice(0, entropyLength);
      this.#mnemonic = bip39.entropyToMnemonic(entropy, wordlist);
    }

    return this.#mnemonic;
  }
}

// Private

interface BaseChallengeSnapshot {
  id: string;
  clientHints?: string;
  status: ChallengeStatus;
}

interface PendingChallengeSnapshot extends BaseChallengeSnapshot {
  status: "pending";
}

interface PassedChallengeSnapshot extends BaseChallengeSnapshot {
  status: "passed";
  user: User;
}

const codeLength = 8;
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
