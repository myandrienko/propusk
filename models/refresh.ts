import { nanoid } from "nanoid";
import * as codecs from "../lib/codecs.ts";
import { seal, unseal, type ExpirationOptions } from "../lib/seal.ts";
import { SessionRef } from "./session.ts";

const nonceLength = 24;

export class RefreshNonce {
  static readonly format = [...SessionRef.format, nonceLength] as const;
  readonly userId: string;
  readonly sessionId: string;
  readonly nonce: string;
  #bytes: Uint8Array;

  static provision() {
    return nanoid(nonceLength);
  }

  static fromToken(token: string): RefreshNonce {
    return new RefreshNonce(unseal(token, { expires: true }));
  }

  constructor(
    ...args:
      | [userId: string, sessionId: string, nonce: string]
      | [payload: Uint8Array]
  ) {
    [this.userId, this.sessionId, this.nonce, this.#bytes] = codecs.b64concat(
      RefreshNonce.format,
      ...args,
    );
  }

  getToken(options: Required<ExpirationOptions>): string {
    return seal(this.#bytes, options);
  }
}
