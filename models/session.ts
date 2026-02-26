import { customAlphabet, nanoid, urlAlphabet } from "nanoid";
import { codec } from "../lib/codec.ts";
import { Sealable } from "../lib/seal.ts";
import { UserRef, type User } from "./user.ts";

export interface Session {
  rt: string;
  user: User;
  clientHints?: string;
  createdAt: number;
}

export class SessionRef {
  readonly userId: string;
  readonly id: string;

  #payload: Sealable;

  static provision(): string {
    return nanoid(idLength);
  }

  static fromToken(token: string): SessionRef {
    const payload = Sealable.fromSealed(token);
    return new SessionRef(payload);
  }

  private constructor(
    ...args: [userId: string, id: string] | [payload: Sealable]
  ) {
    [this.userId, this.id, this.#payload] = codec(
      [UserRef.size, idLength],
      ...args,
    );
  }

  getToken(): string {
    return this.#payload.seal();
  }
}

export function getSessionKey(userId: string, sessionId: string): string {
  return `session:${userId}:${sessionId}`;
}

// Private

const idLength = 24;
