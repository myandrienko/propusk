import { nanoid } from "nanoid";
import { codec } from "../lib/codec.ts";
import { seal, unseal } from "../lib/seal.ts";
import { UserRef, type User } from "./user.ts";

export interface Session {
  user: User;
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
  #bytes: Uint8Array;

  static provision(): string {
    return nanoid(sessionIdLength);
  }

  static fromToken(token: string): SessionRef {
    return new SessionRef(unseal(token));
  }

  constructor(...args: [userTgId: number, id: string] | [payload: Uint8Array]) {
    let userTgId: number;
    [userTgId, this.id, this.#bytes] = codec(SessionRef.format, ...args);
    this.userRef = UserRef.fromTgId(userTgId);
  }

  getToken(): string {
    return seal(this.#bytes);
  }
}

export function getSessionKey(userTgId: number, sessionId: string): string {
  return `session:${userTgId}:${sessionId}`;
}
