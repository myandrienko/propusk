import { gcmsiv } from "@noble/ciphers/aes.js";
import { concatBytes, createView, randomBytes } from "@noble/ciphers/utils.js";
import { base64urlnopad } from "@scure/base";
import { unix } from "./time.ts";

export type ExpirationOptions = { now?: number } & (
  | { ex: number }
  | { exat: number }
);

export interface ExpirationCheckOptions {
  now?: number;
  clockTolerance?: number;
}

/**
 * Symmetrically encrypted authenticated value, represented with
 * a base64url-encoded token.
 */
export const sealedValue = withStrategy({
  nonce: () => [randomBytes(gcmsiv.nonceLength), true],
  parse: (ct: Uint8Array) => [
    ct.subarray(0, gcmsiv.nonceLength),
    ct.subarray(gcmsiv.nonceLength),
  ],
});

/**
 * Symmetrically encrypted authenticated value, represented with
 * a base64url-encoded token, with a specified expiration timestamp.
 */
export const sealedValueEx = withStrategy({
  nonce: (options: ExpirationOptions) => {
    const maxUint32 = 0xffff_ffff;
    const exat =
      "ex" in options ? (options.now ?? unix()) + options.ex : options.exat;

    if (exat < 0 || exat > maxUint32) {
      throw new Error(
        `Expiration timestamp must be between 0 and ${maxUint32}`,
      );
    }

    const nonce = randomBytes(gcmsiv.nonceLength);
    const view = createView(nonce);
    view.setUint32(0, exat);
    return [nonce, true];
  },

  parse: (ct: Uint8Array, options: ExpirationCheckOptions = {}) => {
    const nonce = ct.subarray(0, gcmsiv.nonceLength);
    const view = createView(nonce);
    const exat = view.getUint32(0);

    if (exat + (options.clockTolerance ?? 0) < (options.now ?? unix())) {
      throw new ExpiredSealedValueError("Sealed value expired");
    }

    return [nonce, ct.subarray(gcmsiv.nonceLength)];
  },
});

/**
 * Given a value sealed by `sealedValueEx`, returns its expiration timestamp
 * (unix time).
 */
export function parseExpAt(sealed: string): number {
  const bytes = base64urlnopad.decode(sealed);
  const view = createView(bytes);
  return view.getUint32(0);
}

/**
 * Symmetrically and deterministically encrypted authenticated value,
 * represented with a base64url-encoded token. Equal payloads produce equal
 * tokens, which makes it useful for obfuscating IDs.
 */
export const sealedId = withStrategy({
  nonce: () => [new Uint8Array(gcmsiv.nonceLength), false],
  parse: (ct: Uint8Array) => [new Uint8Array(gcmsiv.nonceLength), ct],
});

export class InvalidSealedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSealedValueError";
  }
}

export class ExpiredSealedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiredSealedValueError";
  }
}

// Private

interface SealingStrategy<S extends unknown[], U extends unknown[]> {
  nonce: (...args: S) => [nonce: Uint8Array, shouldPrepend: boolean];
  parse: (bytes: Uint8Array, ...args: U) => [nonce: Uint8Array, ct: Uint8Array];
}

interface SealedValue<S extends unknown[], U extends unknown[]> {
  seal(payload: Uint8Array, ...args: S): string;
  unseal(sealed: string, ...args: U): Uint8Array;
}

function withStrategy<S extends unknown[], U extends unknown[]>(
  s: SealingStrategy<S, U>,
) {
  return (key: Uint8Array): SealedValue<S, U> => {
    if (key.length !== 32) {
      throw new Error("Key must have length 32");
    }

    return {
      seal(payload, ...args) {
        const [nonce, shouldPrepend] = s.nonce(...args);
        const ct = gcmsiv(key, nonce).encrypt(payload);
        const bytes = shouldPrepend ? concatBytes(nonce, ct) : ct;
        return base64urlnopad.encode(bytes);
      },

      unseal(sealed, ...args) {
        let bytes: Uint8Array;

        try {
          bytes = base64urlnopad.decode(sealed);
        } catch {
          throw new InvalidSealedValueError("Sealed value is malformed");
        }

        const [nonce, ct] = s.parse(bytes, ...args);

        try {
          return gcmsiv(key, nonce).decrypt(ct);
        } catch {
          throw new InvalidSealedValueError("Sealed value is invalid");
        }
      },
    };
  };
}
