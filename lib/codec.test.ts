import { nanoid } from "nanoid";
import assert from "node:assert/strict";
import { it } from "node:test";
import { codec, CodecFormatError } from "./codec.ts";

it("encodes and decodes", () => {
  const a = nanoid(8);
  const b = 123456789;
  const c = nanoid(12);
  const format = ["8b64", "f64", "12b64"] as const;

  const [ra, rb, rc, payload] = codec(format, a, b, c);
  assert.equal(ra, a);
  assert.equal(rb, b);
  assert.equal(rc, c);
  assert.ok(payload instanceof Uint8Array);

  const [da, db, dc, dpayload] = codec(format, payload);
  assert.equal(da, a);
  assert.equal(db, b);
  assert.equal(dc, c);
  assert.deepEqual(dpayload, payload);
});

it("throws on invalid b64 format: not multiple of 4", () => {
  assert.throws(() => codec(["3b64"], "abc"), CodecFormatError);
});

it("throws on b64 length mismatch", () => {
  assert.throws(() => codec(["8b64"], nanoid(4)), CodecFormatError);
});

it("throws on invalid b64 alphabet", () => {
  assert.throws(() => codec(["4b64"], "ab!d"), CodecFormatError);
});

it("throws on unexpected payload length", () => {
  assert.throws(() => codec(["8b64"], new Uint8Array(3)), CodecFormatError);
  assert.throws(() => codec(["f64"], new Uint8Array(4)), CodecFormatError);
});
