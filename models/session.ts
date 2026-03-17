import { nanoid } from "nanoid";
import { codec } from "../lib/codec.ts";
import { seal, unseal } from "../lib/seal.ts";
import { UserRef, type User } from "./user.ts";

export interface Session {
  tguid: number;
  clientHints?: string;
  createdAt: number;
  nonce: string;
}

const sessionIdLength = 24;

export class SessionRef {
  static readonly format = [
    ...UserRef.format,
    `${sessionIdLength}b64`,
  ] as const;
  readonly userRef: UserRef;
  readonly id: string;
  #asBytes: () => Uint8Array;

  static provision(): string {
    return nanoid(sessionIdLength);
  }

  static fromToken(token: string): SessionRef {
    return new SessionRef(unseal(token));
  }

  constructor(...args: [tguid: number, id: string] | [payload: Uint8Array]) {
    let tguid: number;
    [tguid, this.id, this.#asBytes] = codec(SessionRef.format, ...args);
    this.userRef = new UserRef(tguid);
  }

  getToken(): string {
    return seal(this.#asBytes());
  }
}

export function getSessionKey(tguid: number, sessionId: string): string {
  return `session:${tguid}:${sessionId}`;
}
