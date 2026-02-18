import type { Redis } from "@upstash/redis";
import { getRedis } from "./redis.ts";

export interface Script<T extends (...args: string[]) => unknown> {
  (keys: string[], ...args: Parameters<T>): Promise<ReturnType<T>>;
}

export function script<T extends (...args: string[]) => unknown>(
  template: readonly string[],
  ...substitutions: unknown[]
): Script<T> {
  const src = String.raw({ raw: template }, substitutions).trim();
  return createScript(src);
}

// Private

type RedisScript<R> = ReturnType<typeof Redis.prototype.createScript<R, false>>;

function createScript<T extends (...args: string[]) => unknown>(
  src: string,
): Script<T> {
  let script: RedisScript<ReturnType<T>>;

  return async function execScript(
    keys: string[],
    ...args: Parameters<T>
  ): Promise<ReturnType<T>> {
    if (!script) {
      script = getRedis().createScript(src);
    }

    return await script.exec(keys, args);
  };
}
