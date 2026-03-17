import { gcmsiv } from "@noble/ciphers/aes.js";
import { concatBytes, createView } from "@noble/ciphers/utils.js";
import { base64urlnopad } from "@scure/base";
import { env } from "./env.ts";
import { UnauthorizedError } from "./errors.ts";
import { unix } from "./time.ts";
import { e } from "./try.ts";

export type ExpirationCheckOptions =
  | ExpirationCheckNotRequiredOptions
  | ExpirationCheckRequiredOptions;

export interface ExpirationOptions {
  exat?: number;
}

export function unseal(
  sealed: string,
  options?: ExpirationCheckNotRequiredOptions,
): Uint8Array;
export function unseal(
  sealed: string,
  options: ExpirationCheckRequiredOptions,
): [exat: number, unsealed: Uint8Array];
export function unseal(
  sealed: string,
  options: ExpirationCheckOptions = {},
): Uint8Array | [exat: number, unsealed: Uint8Array] {
  const bytes = e.try(
    () => base64urlnopad.decode(sealed),
    () => new InvalidSealedValueError("Sealed value is malformed"),
  );

  let nonce = new Uint8Array(gcmsiv.nonceLength);
  let ct = bytes;
  let exat: number | undefined;

  if (options.expires) {
    exat = createView(bytes).getUint32(0);

    if (exat + (options.clockTolerance ?? 0) < (options.now ?? unix())) {
      throw new InvalidSealedValueError("Sealed value expired");
    }

    const timestampSize = 4;
    nonce.set(bytes.subarray(0, timestampSize));
    ct = bytes.subarray(timestampSize);
  }

  const unsealed = e.try(
    () => gcmsiv(getSealKey(), nonce).decrypt(ct),
    () => new InvalidSealedValueError("Sealed value is invalid"),
  );

  return options.expires ? [exat!, unsealed] : unsealed;
}

export function seal(
  unsealed: Uint8Array,
  options: ExpirationOptions = {},
): string {
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

  const ct = gcmsiv(getSealKey(), nonce).encrypt(unsealed);
  const bytes = options.exat ? concatBytes(nonce.subarray(0, 4), ct) : ct;
  return base64urlnopad.encode(bytes);
}

export class InvalidSealedValueError extends UnauthorizedError {
  name = "InvalidSealedValueError";
}

// Private

interface BaseExpirationCheckOptions {
  expires?: boolean;
}

interface ExpirationCheckNotRequiredOptions extends BaseExpirationCheckOptions {
  expires?: false;
}

interface ExpirationCheckRequiredOptions extends BaseExpirationCheckOptions {
  expires: true;
  clockTolerance?: number;
  now?: number;
}

function getSealKey() {
  return env.SEAL_KEY.hex(32);
}
