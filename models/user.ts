import { sha256 } from "@noble/hashes/sha2.js";
import { base64urlnopad, hex } from "@scure/base";
import { codec } from "../lib/codec.ts";
import { seal, unseal } from "../lib/seal.ts";

export interface User {
  tgId: number;
  name: string;
  lang: string;
  image?: string;
}

export class UserRef {
  static readonly format = ["f64"] as const;

  readonly id: string;
  readonly tgId: number;
  #bytes: Uint8Array;

  static fromId(id: string): UserRef {
    const [tgId, bytes] = codec(UserRef.format, unseal(id));
    return new UserRef({ id, tgId, bytes });
  }

  static fromTgId(tgId: number): UserRef {
    const [, bytes] = codec(UserRef.format, tgId);
    return new UserRef({ id: seal(bytes), tgId, bytes });
  }

  private constructor(init: UserRefInit) {
    this.id = init.id;
    this.tgId = init.tgId;
    this.#bytes = init.bytes;
  }

  digest(): string {
    return hex.encode(sha256(this.#bytes));
  }
}

// Private

interface UserRefInit {
  id: string;
  tgId: number;
  bytes: Uint8Array;
}
