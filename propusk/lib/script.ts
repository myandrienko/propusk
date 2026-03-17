import { sha1 } from "@noble/hashes/legacy.js";
import { hex } from "@scure/base";
import { ConflictError, NotFoundError } from "./errors.ts";
import { getRedis } from "./redis.ts";

export interface Script<T extends (...args: any[]) => unknown> {
  (keys: string[], ...args: Parameters<T>): Promise<ReturnType<T>>;
}

export interface ErrorMessages {
  notFound: string;
  conflict: string;
}

export function script<T extends (...args: any[]) => unknown>(
  template: readonly string[],
  ...substitutions: unknown[]
): Script<T> {
  const src = String.raw({ raw: template }, substitutions).trim();
  const cachedScript = new CachedScript<T>(src);
  return cachedScript.exec.bind(cachedScript);
}

export function mapScriptError(
  err: unknown,
  messages: Partial<ErrorMessages> = {},
): Error | undefined {
  if (err instanceof Error) {
    if (err.message.includes("NOTFOUND")) {
      return new NotFoundError(messages.notFound ?? "Entity not found");
    }

    if (err.message.includes("CONFLICT")) {
      return new ConflictError(
        messages.conflict ?? "Conflict on updating entity",
      );
    }
  }
}

// Private

class CachedScript<T extends (...args: any[]) => unknown> {
  #src: string;
  #sha: string | undefined;

  constructor(src: string) {
    this.#src = src;
  }

  async exec(keys: string[], ...args: Parameters<T>): Promise<ReturnType<T>> {
    const redis = getRedis();
    const sha = this.#digest();

    try {
      return await redis.evalsha<Parameters<T>, ReturnType<T>>(sha, keys, args);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        return await redis.eval<Parameters<T>, ReturnType<T>>(
          this.#src,
          keys,
          args,
        );
      }

      throw err;
    }
  }

  #digest() {
    if (!this.#sha) {
      const bytes = new TextEncoder().encode(this.#src);
      this.#sha = hex.encode(sha1(bytes));
    }

    return this.#sha;
  }
}
