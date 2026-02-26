import { base64urlnopad } from "@scure/base";
import { env } from "./env.ts";
import { gcmsiv } from "@noble/ciphers/aes.js";
import { concatBytes, createView } from "@noble/ciphers/utils.js";
import { unix } from "./time.ts";
import { etry } from "./try.ts";

export type SealableExpirationCheckOptions =
  | { expires?: false }
  | { expires: true; clockTolerance?: number; now?: number };

export interface SealableExpirationOptions {
  exat?: number;
}

export class Sealable {
  readonly value: string;
  readonly asBytes: () => Uint8Array;

  static fromSealed(
    sealed: string,
    options: SealableExpirationCheckOptions = {},
  ): Sealable {
    const sealedBytes = etry(() => base64urlnopad.decode(sealed)).catch(
      () => new InvalidSealedValueError("Sealed value is malformed"),
    );

    let nonce = new Uint8Array(gcmsiv.nonceLength);
    let ct = sealedBytes;

    if (options.expires) {
      const exat = createView(sealedBytes).getUint32(0);

      if (exat + (options.clockTolerance ?? 0) < (options.now ?? unix())) {
        throw new ExpiredSealedValueError("Sealed value expired");
      }

      nonce.set(sealedBytes.subarray(0, 4));
      ct = sealedBytes.subarray(4);
    }

    const key = getSealKey();
    const bytes = etry(() => gcmsiv(key, nonce).decrypt(ct)).catch(
      () => new InvalidSealedValueError("Sealed value is invalid"),
    );

    return new Sealable(base64urlnopad.encode(bytes), bytes);
  }

  constructor(value: string, precomputedBytes?: Uint8Array) {
    this.value = value;
    let bytes = precomputedBytes;
    this.asBytes = () => bytes ?? (bytes = base64urlnopad.decode(value));
  }

  seal(options: SealableExpirationOptions = {}): string {
    const nonce = new Uint8Array(gcmsiv.nonceLength);

    if (options.exat) {
      const maxUint32 = 0xffff_ffff;

      if (options.exat < 0 || options.exat > maxUint32) {
        throw new Error(
          `Expiration timestamp must be between 0 and ${maxUint32}`,
        );
      }

      createView(nonce).setUint32(0, options.exat);
    }

    const ct = gcmsiv(getSealKey(), nonce).encrypt(
      etry(() => this.asBytes()).catch(
        () => new UnsealableValueError("Invalid sealable value format"),
      ),
    );
    const sealedBytes = options.exat
      ? concatBytes(nonce.subarray(0, 4), ct)
      : ct;
    return base64urlnopad.encode(sealedBytes);
  }
}

export class UnsealableValueError extends Error {
  name = "UnsealableValueError";
}

export class InvalidSealedValueError extends Error {
  name = "InvalidSealedValueError";
}

export class ExpiredSealedValueError extends Error {
  name = "ExpiredSealedValueError";
}

// Private

function getSealKey() {
  return env.SEAL_KEY.hex(32);
}
