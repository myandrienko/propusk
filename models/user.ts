import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import * as codecs from "../lib/codecs.ts";
import { seal, unseal } from "../lib/seal.ts";

export interface User {
  id: string;
  name: string;
  lang: string;
  image?: string;
}

export class UserRef {
  // Sealed representation of float64 is 11 base64 characters
  static readonly format = [11] as const;

  readonly id: string;
  readonly tgId: number;
  #bytes: Uint8Array;

  static fromId(id: string): UserRef {
    const [tgId, bytes] = codecs.f64(unseal(id));
    return new UserRef({ id, tgId, bytes });
  }

  static fromTgId(tgId: number): UserRef {
    const [, bytes] = codecs.f64(tgId);
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
