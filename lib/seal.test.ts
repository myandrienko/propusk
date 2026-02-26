import assert from "node:assert/strict";
import { it } from "node:test";
import { unix } from "./time.ts";
import { ExpiredSealedValueError, Sealable } from "./seal.ts";
import { nanoid } from "nanoid";

const payload = nanoid(24);
const now = unix();

it("seals and unseals", () => {
  const sealed = new Sealable(payload).seal();
  assert.equal(typeof sealed, "string");
  assert.deepEqual(Sealable.fromSealed(sealed).value, payload);
});

it("seals with expiration and unseals", () => {
  const sealed = new Sealable(payload).seal({ exat: now + 60 });
  assert.equal(typeof sealed, "string");
  assert.deepEqual(
    Sealable.fromSealed(sealed, { expires: true, now }).value,
    payload,
  );
});

it("throws when expired", () => {
  const sealed = new Sealable(payload).seal({ exat: now });
  assert.equal(typeof sealed, "string");
  assert.throws(
    () =>
      Sealable.fromSealed(sealed, {
        expires: true,
        now: now + 1,
      }).value,
    ExpiredSealedValueError,
  );
});

it("allows expired value within clock tolerance", () => {
  const sealed = new Sealable(payload).seal({ exat: now });
  assert.equal(typeof sealed, "string");
  assert.deepEqual(
    Sealable.fromSealed(sealed, {
      expires: true,
      now: now + 5,
      clockTolerance: 5,
    }).value,
    payload,
  );
});

it("throws when expired beyond clock tolerance", () => {
  const sealed = new Sealable(payload).seal({ exat: now });
  assert.equal(typeof sealed, "string");
  assert.throws(
    () =>
      Sealable.fromSealed(sealed, {
        expires: true,
        now: now + 6,
        clockTolerance: 5,
      }).value,
    ExpiredSealedValueError,
  );
});
