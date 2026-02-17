import { it } from "node:test";
import assert from "node:assert/strict";
import { createChallenge, tryConsumeChallenge } from "./challenge.ts";

it("creates a challenge", async () => {
  const challenge = await createChallenge();
  console.log(challenge);
});

it.only("consumes a challenge", async () => {
  const challenge = await createChallenge();
  console.log(challenge);
  const status = await tryConsumeChallenge(challenge.token);
  console.log(status);
});
