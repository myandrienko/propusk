import assert from "node:assert/strict";
import { it } from "node:test";
import { InvalidSealedValueError, seal, unseal } from "./seal.ts";
import { unix } from "./time.ts";

const payload = new TextEncoder().encode("Hello, world!");
const now = unix();

it("seals and unseals", () => {
  const sealed = seal(payload);
  assert.equal(typeof sealed, "string");
  assert.deepEqual(unseal(sealed), payload);
});

it("seals with expiration and unseals", () => {
  const sealed = seal(payload, { exat: now + 60 });
  assert.equal(typeof sealed, "string");
  assert.deepEqual(unseal(sealed, { expires: true, now }), payload);
});

it("throws when expired", () => {
  const sealed = seal(payload, { exat: now });
  assert.equal(typeof sealed, "string");
  assert.throws(
    () => unseal(sealed, { expires: true, now: now + 1 }),
    InvalidSealedValueError,
  );
});

it("allows expired value within clock tolerance", () => {
  const sealed = seal(payload, { exat: now });
  assert.equal(typeof sealed, "string");
  assert.deepEqual(
    unseal(sealed, { expires: true, now: now + 5, clockTolerance: 5 }),
    payload,
  );
});

it("throws when expired beyond clock tolerance", () => {
  const sealed = seal(payload, { exat: now });
  assert.equal(typeof sealed, "string");
  assert.throws(
    () => unseal(sealed, { expires: true, now: now + 6, clockTolerance: 5 }),
    InvalidSealedValueError,
  );
});
