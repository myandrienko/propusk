import { getRedis } from "./redis.ts";
import { sha1 } from "@noble/hashes/legacy.js";
import { hex } from "@scure/base";

export interface Script<T extends (...args: string[]) => unknown> {
  (keys: string[], ...args: Parameters<T>): Promise<ReturnType<T>>;
}

export function script<T extends (...args: string[]) => unknown>(
  template: readonly string[],
  ...substitutions: unknown[]
): Script<T> {
  const src = String.raw({ raw: template }, substitutions).trim();
  const cachedScript = new CachedScript<T>(src);
  return cachedScript.exec.bind(cachedScript);
}

// Private

class CachedScript<T extends (...args: string[]) => unknown> {
  private src: string;
  private sha: string | undefined;

  constructor(src: string) {
    this.src = src;
  }

  async exec(keys: string[], ...args: Parameters<T>): Promise<ReturnType<T>> {
    const redis = getRedis();
    const sha = this.digest();

    try {
      return await redis.evalsha<Parameters<T>, ReturnType<T>>(sha, keys, args);
    } catch (err) {
      if (err instanceof Error && err.message.includes("NOSCRIPT")) {
        return await redis.eval<Parameters<T>, ReturnType<T>>(
          this.src,
          keys,
          args,
        );
      }

      throw err;
    }
  }

  private digest() {
    if (!this.sha) {
      const bytes = new TextEncoder().encode(this.src);
      this.sha = hex.encode(sha1(bytes));
    }

    return this.sha;
  }
}
