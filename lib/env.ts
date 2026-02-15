import { base16 } from "@scure/base";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      UPSTASH_REDIS_REST_URL: string;
      UPSTASH_REDIS_REST_TOKEN: string;
      SEAL_KEY: string;
    }
  }
}

export function env(key: keyof NodeJS.ProcessEnv): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value;
}

export function envHex(key: keyof NodeJS.ProcessEnv): Uint8Array {
  return base16.decode(env(key));
}
