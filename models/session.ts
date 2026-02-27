import { nanoid } from "nanoid";
import * as codecs from "../lib/codecs.ts";
import { seal, unseal } from "../lib/seal.ts";
import { UserRef, type User } from "./user.ts";

export interface Session {
  rt: string;
  user: User;
  clientHints?: string;
  createdAt: number;
}

const sessionIdLength = 24;

export class SessionRef {
  static readonly format = [...UserRef.format, sessionIdLength] as const;
  readonly userId: string;
  readonly id: string;
  #bytes: Uint8Array;

  static provision(): string {
    return nanoid(sessionIdLength);
  }

  static fromToken(token: string): SessionRef {
    return new SessionRef(unseal(token));
  }

  constructor(...args: [userId: string, id: string] | [payload: Uint8Array]) {
    [this.userId, this.id, this.#bytes] = codecs.b64concat(
      SessionRef.format,
      ...args,
    );
  }

  getToken(): string {
    return seal(this.#bytes);
  }
}

export function getSessionKey(userId: string, sessionId: string): string {
  return `session:${userId}:${sessionId}`;
}
