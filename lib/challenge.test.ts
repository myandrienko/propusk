import { it } from "node:test";
import assert from "node:assert/strict";
import { createChallenge } from "./challenge.ts";

it.only("creates a challenge", async () => {
  const challenge = await createChallenge();
  console.log(challenge);
});
