import type { Redis } from "@upstash/redis";
import { getRedis } from "./redis.ts";

type Script<R> = ReturnType<typeof Redis.prototype.createScript<R, false>>;

export function createScript<T extends (...args: string[]) => unknown>(
  src: string,
) {
  let script: Script<ReturnType<T>>;

  return async function execScript(keys: string[], ...args: Parameters<T>) {
    if (!script) {
      script = getRedis().createScript(src);
    }

    return await script.exec(keys, args);
  };
}
