import { Redis } from "@upstash/redis";
import { env } from "./env.ts";

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL(),
      token: env.UPSTASH_REDIS_REST_TOKEN(),
    });
  }

  return redis;
}
