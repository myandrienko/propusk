import { hex } from "@scure/base";

interface Env {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  SEAL_KEY?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Env {}
  }
}

export function env(key: keyof Env): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: "${key}"`);
  }

  return value;
}

export function envHex(key: keyof Env): Uint8Array {
  const str = env(key);

  try {
    return hex.decode(str);
  } catch {
    throw new Error(`Environment variable "${key}" is not a hex string`);
  }
}
