/**
 * Utility functions for preparing binary payloads for sealing, and for parsing
 * binary payloads after unsealing.
 *
 * A lot of model references (see the `models/` directory) can be constructed
 * either from a sealed "token", or by providing values (usually ids) directly.
 * Codec handles both cases: when an unsealed binary payload is provided, it
 * decodes it into values; when values are provided, it encodes them into
 * a binary payload.
 *
 * In either case, both the values and the payload are returned, which makes
 * codec a useful "normalization" step in model reference constructor.
 */

import { base64urlnopad } from "@scure/base";
import { env } from "./env.ts";
import { e } from "./try.ts";

/**
 * Handles one or more base64-encoded fixed-length strings (usually ids).
 * Each string length must be a multiple of 4. String lengths are provided
 * as the `format` parameter. In development, additional checks are used
 * to ensure string format is correct,
 */
export function b64concat<const T extends string[]>(
  format: FormatFor<T>,
  ...argsOrPayload: T | [payload: Uint8Array]
): [...T, Uint8Array] {
  if (env.NODE_ENV() !== "production") {
    if (format.some((length) => length % 4 !== 0)) {
      throw new CodecFormatError("Invalid format: must be multiple of 4");
    }
  }

  const decode = (payload: Uint8Array): T => {
    const str = base64urlnopad.encode(payload);

    if (env.NODE_ENV() !== "production") {
      if (str.length !== format.reduce((sum, len) => sum + len)) {
        throw new CodecFormatError(
          "Invalid payload: length does not match format",
        );
      }
    }

    const parts = Array<string>(format.length);

    let start = 0;
    for (let i = 0; i < format.length; i++) {
      parts[i] = str.slice(start, start + format[i]);
      start += format[i];
    }

    return parts as T;
  };

  const encode = (...args: T): Uint8Array => {
    if (env.NODE_ENV() !== "production") {
      if (args.some((arg, i) => arg.length !== format[i])) {
        throw new CodecFormatError(
          "Invalid argument: length does not match format",
        );
      }
    }

    return e.try(
      () => base64urlnopad.decode("".concat(...args)),
      () => new CodecFormatError("Invalid base64 encoding"),
    );
  };

  if (argsOrPayload[0] instanceof Uint8Array) {
    const payload = argsOrPayload[0];
    return [...decode(payload), payload];
  }

  const args = argsOrPayload as T;
  return [...args, encode(...args)];
}

export class CodecFormatError extends Error {
  name = "CodecFormatError";
}

// Private

type FormatFor<T extends unknown[]> = { readonly [K in keyof T]: number };
