import { nanoid } from "nanoid";
import { codec } from "../lib/codec.ts";
import { seal, unseal } from "../lib/seal.ts";
import { SessionRef } from "./session.ts";

const nonceLength = 24;

export class RefreshNonce {
  static readonly format = [...SessionRef.format, `${nonceLength}b64`] as const;
  readonly exat: number;
  readonly sessionRef: SessionRef;
  readonly nonce: string;
  #asBytes: () => Uint8Array;

  static provision() {
    return nanoid(nonceLength);
  }

  static fromToken(token: string): RefreshNonce {
    return new RefreshNonce(...unseal(token, { expires: true }));
  }

  constructor(
    exat: number,
    ...args:
      | [userTgId: number, sessionId: string, nonce: string]
      | [payload: Uint8Array]
  ) {
    this.exat = exat;
    let userTgId: number;
    let sessionId: string;
    [userTgId, sessionId, this.nonce, this.#asBytes] = codec(
      RefreshNonce.format,
      ...args,
    );
    this.sessionRef = new SessionRef(userTgId, sessionId);
  }

  getToken(): string {
    return seal(this.#asBytes(), { exat: this.exat });
  }
}
