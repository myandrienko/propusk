import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { codec } from "../lib/codec.ts";
import { seal, unseal } from "../lib/seal.ts";

export interface User {
  name: string;
  lang: string;
  image?: string;
}

export class UserRef {
  static readonly format = ["f64"] as const;

  readonly tguid: number;
  #asBytes: () => Uint8Array;

  static fromPuid(id: string): UserRef {
    return new UserRef(unseal(id));
  }

  constructor(...args: [tguid: number] | [payload: Uint8Array]) {
    [this.tguid, this.#asBytes] = codec(UserRef.format, ...args);
  }

  getPuid(): string {
    return seal(this.#asBytes());
  }

  digest(): string {
    return hex.encode(sha256(this.#asBytes()));
  }
}

export function getUserKey(tguid: number): string {
  return `user:${tguid}`;
}
