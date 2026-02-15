import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sealedValue, sealedValueExp, sealedId, parseExpAt, ExpiredError } from "./seal.ts";
import { envHex } from "./env.ts";

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
  const sv = sealedValueExp(key);
  const now = Math.trunc(Date.now() / 1000);

  it("seals with exp and unseals", () => {
    const sealed = sv.seal(payload, { exp: 60, now });
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed, { now }), payload);
  });

  it("seals with expAt and unseals", () => {
    const sealed = sv.seal(payload, { expAt: now + 60 });
    assert.equal(typeof sealed, "string");
    assert.deepEqual(sv.unseal(sealed, { now }), payload);
  });

  it("throws when expired", () => {
    const sealed = sv.seal(payload, { expAt: now });
    assert.throws(() => sv.unseal(sealed, { now: now + 1 }), ExpiredError);
  });

  it("allows expired value within clock tolerance", () => {
    const sealed = sv.seal(payload, { expAt: now });
    assert.deepEqual(
      sv.unseal(sealed, { now: now + 5, clockTolerance: 5 }),
      payload,
    );
  });

  it("throws when expired beyond clock tolerance", () => {
    const sealed = sv.seal(payload, { expAt: now });
    assert.throws(
      () => sv.unseal(sealed, { now: now + 6, clockTolerance: 5 }),
      ExpiredError,
    );
  });

  it("parseExpAt returns the expiration timestamp", () => {
    const expAt = now + 3600;
    const sealed = sv.seal(payload, { expAt });
    assert.equal(parseExpAt(sealed), expAt);
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
