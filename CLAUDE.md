**Propusk** is an authentication system that relies on Telegram as an identity
provider.

## Basics

For now, Propusk is a single Next.js project that includes both a library of
authentication methods, and a demo application.

```bash
pnpm dev # starts dev server
pnpm build # type checks, creates production build
pnpm lint # runs ESLint
pnpm test # runs all tests (using node:test)
pnpm test lib/seal.test.ts # runs a specific test file
```

Compilation is not needed to run tests: Node LTS automatically strips types from
TS files. For that to work, all imports must include original file extensions.
For example: `import "./seal.ts"`.

## Where Code Goes

From lowest to highest logical level:

`lib/` for low-level helpers.  
`models/` for domain types and reference classes (see below).  
`services/` for high-level business logic.  
`app/` for demo app code and endpoints.

Development-only scripts go to `scripts/`.

## How Propusk Works

Actors: the user, the app (that wants to authenticate the user), Propusk
(working on the app's backend), the bot (trusted Telegram bot with its webhook
set to the app's backend).

KV storage: Upstash Redis via REST API (Lua scripting for atomic
check-and-update), configurable in the future.

Blob storage: Vercel Blob, configurable in the future.

Telegram API is used via `wrappergram`.

### Sealed values

SEAL (see `lib/seal.ts`) is Propusk's token format: payload is encrypted with
AES-GCM-SIV using a zero IV (ciphertext is deterministic - preferred when a
sealed value serves as an id), then encoded to URL-safe Base64 without padding.
The authentication tag prevents tampering and enumaration.

For expirable values, the first 4 bytes of the IV are a uint32 expiration
timestamp (UNIX time) - appended to ciphertext.

Payload values are packed using a struct format (see `lib/codec.ts`). A schema
defines how values are prepared for sealing and retrieved after unsealing, e.g.
`['24b64', 'f64']` is a 24-character Base64-encoded string plus a
double-precision float.

### Getting Authenticated

**Step 1.** The app requests to create a challenge (see `createChallenge` in
`services/challenge.ts`). Propusk creates a pending challenge valid for 10
minutes, referenced by its unique id (see `ChallengeRef#provision` in
`models/challenge.ts`). Values derived from the id:

- challenge token = id sealed into an expirable token
- challenge code = the first 8 characters of the id
- mnemonic (or "magic phrase") = BIP39 mnemonic

The challenge is persisted in KV storage keyed by the code (the full id is
verified on every operation). Additional "client hints" (user's location, device
name, etc.) are also saved.

Token, code, and mnemonic are returned to the app. Code and mnemonic should be
communicated to the user.

**Step 2.** The user sends the challenge code to the bot. The webhook update
reaches the app (see `app/api/bot/`) which passes it to Propusk (see
`services/bot.ts`).

Propusk looks up the challenge by code (see `readChallenge` in
`services/challenge.ts`) and sends a verification prompt via the bot. The prompt
asks the user to confirm by selecting the word at a prompted position from the
magic phrase, or to deny. The response (action + challenge token) is sent via an
inline keyboard callback.

**Step 3.** Propusk handles the callback. If denied, the challenge is deleted
(see `deleteChallenge`). If confirmed, the challenge is marked as passed (see
`passChallenge`) and user data is added.

User data comes from the webhook payload. User photos (if any) are stored in
blob storage keyed by a hashed Telegram user id.

Propusk then sends a confirmation message via the bot with an inline keyboard
button to sign out (deletes both the challenge and the session, see
`deleteSession` in `services/session.ts`).

**Step 4.** Meanwhile, the app polls to consume the challenge (exchanging the
token for a session). Pending challenges cannot be consumed; passed challenges
can only be consumed once.

On successful consumption (see `tryConsumeChallenge` in
`services/challenge.ts`), Propusk creates a session (see `createSession`):

- session id = challenge id
- refresh nonce = a unique string
- bound to the user's Telegram id

The session is persisted in KV storage keyed by Telegram user id + session id
(enabling session listing). Returned to the app:

- refresh token = session id, Telegram user id, and refresh nonce, sealed with
  expiration
- access token = short-lived JWT with user data and a client-facing id (sealed
  Telegram user id)

### Staying Authenticated

The app periodically refreshes the access token (see `refreshSession` in
`services/session.ts`). The refresh nonce is rotated every time, making refresh
tokens single-use.

Access tokens are very short-lived, so (even though they cannot be revoked) any
session can be revoked within the access token's short TTL.

## Coding Patterns

Use semantic errors: `NotFoundError`, `UnauthorizedError`, `ConflictError` map
to HTTP response codes.

Use the safe proxy to access and parse environment variables (see `lib/env.ts`).

Reference classes (`ChallengeRef`, `SessionRef`, `UserRef`, `RefreshNonce` in
`models/`) represent a reference to a persisted entity: enough data to read or
manipulate it, but not the entity's data itself. E.g. `SessionRef` contains user
id and session id which are enough to construct the session's KV key.

References can be serialized into tokens (usually via `getToken()`) and
constructed from tokens (usually via `fromToken()`), using `lib/codec.ts` for
payload encoding and decoding.

Any methods that only require a reference and don't require retrieving full
entity data (like generating a mnemonic for a challenge) should be implemented
in a reference class.
