import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { customAlphabet, urlAlphabet } from "nanoid";
import { UnauthorizedError } from "../lib/errors.ts";
import {
  ExpiredSealedValueError,
  InvalidSealedValueError,
  Sealable,
  type SealableExpirationOptions,
} from "../lib/seal.ts";
import type { User } from "./user.ts";
import { etry } from "../lib/try.ts";

export type Challenge = PendingChallenge | PassedChallenge;
export type ChallengeStatus = "pending" | "passed";

export interface PendingChallenge extends BaseChallenge {
  status: "pending";
}

export interface PassedChallenge extends BaseChallenge {
  status: "passed";
  user: User;
}

export const codeLength = 8;

export class ChallengeRef {
  readonly code: string;

  #payload: Sealable;

  static create(): ChallengeRef {
    return new ChallengeRef(generateId());
  }

  protected static fromToken(token: string): ChallengeRef {
    const payload = etry(() =>
      Sealable.fromSealed(token, { expires: true }),
    ).catch((err) => {
      if (
        err instanceof InvalidSealedValueError ||
        err instanceof ExpiredSealedValueError
      ) {
        return new InvalidChallengeTokenError(
          "Challenge token invalid or expired",
          { cause: err },
        );
      }
    });

    return new ChallengeRef(payload);
  }

  constructor(...args: [id: string] | [payload: Sealable]) {
    const [id, payload] =
      typeof args[0] === "string"
        ? [args[0], new Sealable(args[0])]
        : [args[0].value, args[0]];

    this.#payload = payload;
    this.code = id.slice(0, codeLength);
  }

  getToken(options: Required<SealableExpirationOptions>) {
    return this.#payload.seal(options);
  }

  getMnemonic() {
    const bytes = this.#payload.asBytes();
    // Length of entropy for BIP39 must be a multiple of 32 bits:
    const entropyLength = Math.trunc(bytes.length / 4) * 4;
    const entropy = bytes.slice(0, entropyLength);
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
  exat: number;
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
