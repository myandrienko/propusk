import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { envHex } from "./env.ts";
import {
  ExpiredSealedValueError,
  parseExat,
  sealedId,
  sealedValue,
  sealedValueEx,
} from "./seal.ts";
import { unix } from "./time.ts";

const key = envHex("SEAL_KEY");
const payload = new TextEncoder().encode("hello");

describe("sealedValue", () => {
  it("seals and unseals", () => {
    const sv = sealedValue(key);
    const sealed = sv.seal(payload);
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed), payload);
  });
});

describe("sealedValueExp", () => {
  const sv = sealedValueEx(key);
  const now = unix();

  it("seals with exp and unseals", () => {
    const sealed = sv.seal(payload, { ex: 60, now });
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed, { now }), payload);
  });

  it("seals with expAt and unseals", () => {
    const sealed = sv.seal(payload, { exat: now + 60 });
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed, { now }), payload);
  });

  it("throws when expired", () => {
    const sealed = sv.seal(payload, { exat: now });
    assert.throws(
      () => sv.unseal(sealed, { now: now + 1 }),
      ExpiredSealedValueError,
    );
  });

  it("allows expired value within clock tolerance", () => {
    const sealed = sv.seal(payload, { exat: now });
    assert.deepEqual(
      sv.unseal(sealed, { now: now + 5, clockTolerance: 5 }),
      payload,
    );
  });

  it("throws when expired beyond clock tolerance", () => {
    const sealed = sv.seal(payload, { exat: now });
    assert.throws(
      () => sv.unseal(sealed, { now: now + 6, clockTolerance: 5 }),
      ExpiredSealedValueError,
    );
  });
});

describe("sealedId", () => {
  it("seals and unseals", () => {
    const sv = sealedId(key);
    const sealed = sv.seal(payload);
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed), payload);
  });
});
