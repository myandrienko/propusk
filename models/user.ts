import { sha256 } from "@noble/hashes/sha2.js";
import { env } from "../lib/env.ts";
import { InvalidSealedValueError, sealedId } from "../lib/seal.ts";
import { hex } from "@scure/base";
import { createView } from "@noble/hashes/utils.js";

export interface User {
  id: string;
  name: string;
  lang: string;
  image?: string;
}

export class UserRef {
  readonly tgId: number;

  #bytes: Uint8Array | undefined;

  static fromPublicId(id: string): UserRef {
    let payload: Uint8Array;

    try {
      payload = sealedId(env.SEAL_KEY.hex()).unseal(id);
    } catch (err) {
      if (err instanceof InvalidSealedValueError) {
        throw new InvalidUserIdError("User ID is invalid", { cause: err });
      }

      throw err;
    }

    const tgId = createView(payload).getFloat64(0);
    return new UserRef(tgId);
  }

  constructor(tgId: number) {
    this.tgId = tgId;
  }

  getPublicId(): string {
    return sealedId(env.SEAL_KEY.hex()).seal(this.bytes);
  }

  digest(): string {
    return hex.encode(sha256(this.bytes));
  }

  private get bytes(): Uint8Array {
    if (!this.#bytes) {
      this.#bytes = new Uint8Array(8);
      createView(this.#bytes).setFloat64(0, this.tgId);
    }

    return this.#bytes;
  }
}

export class InvalidUserIdError extends Error {
  name = "InvalidUserIdError";
}
