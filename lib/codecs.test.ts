import { nanoid } from "nanoid";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { b64concat, CodecFormatError, f64 } from "./codecs.ts";

describe("b64concat codec", () => {
  const a = nanoid(8);
  const b = nanoid(12);
  const format = [8, 12] as const;

  it("encodes and decodes two base64 strings", () => {
    const [ra, rb, payload] = b64concat(format, a, b);
    assert.equal(ra, a);
    assert.equal(rb, b);
    assert.ok(payload instanceof Uint8Array);

    const [da, db, dpayload] = b64concat(format, payload);
    assert.equal(da, a);
    assert.equal(db, b);
    assert.deepEqual(dpayload, payload);
  });

  it("throws on invalid format", () => {
    assert.throws(() => b64concat([3], "abc"), CodecFormatError);
  });

  it("throws on invalid argument format: length mismatch", () => {
    assert.throws(() => b64concat([8], nanoid(4)), CodecFormatError);
  });

  it("throws on invalid argument format: invalid alphabet", () => {
    assert.throws(() => b64concat([4], "ab!d"), CodecFormatError);
  });

  it("throws on unexpected payload length", () => {
    assert.throws(() => b64concat([8], new Uint8Array(3)), CodecFormatError);
  });
});

describe("f64 codec", () => {
  const a = 123456789;

  it("encodes and decodes double precision float", () => {
    const [value, payload] = f64(a);
    assert.equal(value, a);
    assert.ok(payload instanceof Uint8Array);
    assert.equal(payload.length, 8);

    const [decoded, dbytes] = f64(payload);
    assert.equal(decoded, a);
    assert.deepEqual(dbytes, payload);
  });

  it("throws on unexpected payload length", () => {
    assert.throws(() => f64(new Uint8Array(4)), CodecFormatError);
  });
});
