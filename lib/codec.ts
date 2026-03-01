import { createView } from "@noble/hashes/utils.js";
import { base64urlnopad } from "@scure/base";
import { env } from "./env.ts";
import { e } from "./try.ts";

/**
 * Utility function for preparing binary payloads for sealing, and for parsing
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
 *
 * Format for codec is defined as an array of specifiers, where each specifier
 * is one of the following:
 *
 * - `NNb64` (where NN is an integer) - base64-ecoded string of length NN
 * - `f64` - double-precision float
 */
export function codec<const F extends readonly FormatSpecifier[]>(
  format: F,
  ...parts: PartsFromFormat<F> | [payload: Uint8Array]
): [...PartsFromFormat<F>, Uint8Array] {
  const encode = (...parts: unknown[]): Uint8Array => {
    const { pformat, totalSize } = parseFormat(format);
    const payload = new Uint8Array(totalSize);
    const view = createView(payload);

    for (let i = 0; i < pformat.length; i++) {
      const [tag, offset, size] = pformat[i];

      if (tag === "b64") {
        const part = parts[i] as string;
        const bytes = e.try(
          () => base64urlnopad.decode(part),
          () => new CodecFormatError("Invalid base64 string"),
        );

        if (bytes.length !== size) {
          throw new CodecFormatError(
            "Invalid part: base64 string length does not match format",
          );
        }

        payload.set(bytes, offset);
      } else if (tag === "f64") {
        const part = parts[i] as number;
        view.setFloat64(offset, part);
      }
    }

    return payload;
  };

  const decode = (payload: Uint8Array): unknown[] => {
    const { pformat, totalSize } = parseFormat(format);

    if (payload.length !== totalSize) {
      throw new CodecFormatError(
        "Invalid payload: length does not match format",
      );
    }

    const view = createView(payload);
    const parts: unknown[] = [];

    for (let i = 0; i < pformat.length; i++) {
      const [tag, offset, size] = pformat[i];

      if (tag === "b64") {
        const bytes = payload.slice(offset, offset + size);
        parts.push(
          e.try(
            () => base64urlnopad.encode(bytes),
            () => new CodecFormatError("Invalid base64 encoding"),
          ),
        );
      } else if (tag === "f64") {
        parts.push(view.getFloat64(offset));
      }
    }

    return parts;
  };

  if (parts[0] instanceof Uint8Array) {
    const payload = parts[0];
    return [...(decode(payload) as PartsFromFormat<F>), payload];
  }

  return [...(parts as PartsFromFormat<F>), encode(...parts)];
}

export class CodecFormatError extends Error {
  name = "CodecFormatError";
}

// Private

type FormatSpecifier = Float64Tag | `${number}${Base64StringTag}`;
type FormatSpecifierTag = Float64Tag | Base64StringTag;
type Float64Tag = "f64";
type Base64StringTag = "b64";
type ParsedFormatSpecifier = [
  tag: FormatSpecifierTag,
  offset: number,
  size: number,
];

type PartsFromFormat<F extends readonly FormatSpecifier[]> =
  F extends readonly [
    infer P extends FormatSpecifier,
    ...infer Rest extends FormatSpecifier[],
  ]
    ? [PartFromFormatSpecifier<P>, ...PartsFromFormat<Rest>]
    : [];

type PartFromFormatSpecifier<P extends FormatSpecifier> = P extends Float64Tag
  ? number
  : P extends `${number}${Base64StringTag}`
    ? string
    : never;

function parseFormat(format: readonly FormatSpecifier[]): {
  pformat: ParsedFormatSpecifier[];
  totalSize: number;
} {
  const pformat: ParsedFormatSpecifier[] = [];
  let offset = 0;
  let totalSize = 0;

  for (const spec of format) {
    let curr: ParsedFormatSpecifier;

    if (spec.endsWith("b64")) {
      const count = Number.parseInt(spec, 10);

      if (env.NODE_ENV() !== "production") {
        if (count % 4 !== 0) {
          throw new CodecFormatError(
            "Invalid format: base64 string length must be multiple of 4",
          );
        }
      }

      curr = ["b64", offset, Math.ceil((count / 4) * 3)];
    } else {
      curr = ["f64", offset, 8];
    }

    pformat.push(curr);
    offset += curr[2];
    totalSize += curr[2];
  }

  return { pformat, totalSize };
}
