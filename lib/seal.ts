import { gcmsiv } from "@noble/ciphers/aes.js";
import { concatBytes, createView, randomBytes } from "@noble/ciphers/utils.js";
import { base64urlnopad } from "@scure/base";

export type ExpirationOptions = { now?: number } & (
  | { exp: number }
  | { expAt: number }
);

export interface ExpirationCheckOptions {
  now?: number;
  clockTolerance?: number;
}

export const sealedValue = withStrategy({
  nonce: () => [randomBytes(gcmsiv.nonceLength), true],
  parse: (ct: Uint8Array) => [
    ct.subarray(0, gcmsiv.nonceLength),
    ct.subarray(gcmsiv.nonceLength),
  ],
});

export const sealedValueExp = withStrategy({
  nonce: (options: ExpirationOptions) => {
    const maxUint32 = 0xffff_ffff;
    const expAt =
      "exp" in options
        ? (options.now ?? Math.trunc(Date.now() / 1000)) + options.exp
        : options.expAt;

    if (expAt < 0 || expAt > maxUint32) {
      throw new Error(
        `Expiration timestamp must be between 0 and ${maxUint32}`,
      );
    }

    const nonce = randomBytes(gcmsiv.nonceLength);
    const view = createView(nonce);
    view.setUint32(0, expAt);
    return [nonce, true];
  },

  parse: (ct: Uint8Array, options: ExpirationCheckOptions = {}) => {
    const nonce = ct.subarray(0, gcmsiv.nonceLength);
    const view = createView(nonce);
    const expAt = view.getUint32(0);

    if (
      expAt + (options.clockTolerance ?? 0) <
      (options.now ?? Math.trunc(Date.now() / 1000))
    ) {
      throw new ExpiredError("Sealed value expired");
    }

    return [nonce, ct.subarray(gcmsiv.nonceLength)];
  },
});

export const sealedId = withStrategy({
  nonce: () => [new Uint8Array(gcmsiv.nonceLength), false],
  parse: (ct: Uint8Array) => [new Uint8Array(gcmsiv.nonceLength), ct],
});

export class ExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpiredError";
  }
}

export class InvalidSealedValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSealedValueError";
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
