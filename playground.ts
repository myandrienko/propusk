import { ChallengeRef } from "./models/challenge.ts";
import { RefreshNonce } from "./models/refresh.ts";
import { UserRef } from "./models/user.ts";
import { createChallenge, tryConsumeChallenge } from "./services/challenge.ts";
import {
  listSessions,
  refreshSession,
  type SessionTokens,
  verifyAccessToken,
} from "./services/session.ts";

const created = await createChallenge({
  clientHints: "testing",
});

console.log("Code:", created.ref.code);
console.log("Mnemonic:", created.ref.getMnemonic());
console.log("Token:", created.ref.getToken());

console.log("Waiting");
let tokens: SessionTokens;

for (let i = 0; ; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Closer to real life: instead of using ref directly, create it from
  // the token:
  const challengeRef = ChallengeRef.fromToken(created.ref.getToken());
  const consumed = await tryConsumeChallenge(challengeRef);

  if (consumed.status !== "passed") {
    console.log("\x1b[F" + "Waiting" + ".".repeat(i));
  } else {
    console.log("\x1b[F" + "Access:", consumed.accessToken);
    console.log("Refresh:", consumed.refreshToken);
    tokens = consumed;
    break;
  }
}

console.log("Listing sessions");

const payload = await verifyAccessToken(tokens.accessToken);
const userRef = UserRef.fromId(payload.sub);
const sessions = await listSessions(userRef);
console.log("Sessions:", sessions);

console.log("Refreshing");

for (let i = 0; ; i++) {
  await new Promise((resolve) => setTimeout(resolve, 1000));
  console.log("\x1b[F" + "Refreshing" + ".".repeat(i));
  tokens = await refreshSession(RefreshNonce.fromToken(tokens.refreshToken));
}
