import { hex } from "@scure/base";

export type SafeEnv = {
  [K in keyof Env]-?: SafeEnvValue;
};

export interface SafeEnvValue {
  (fallback?: string): string;
  hex(fallback?: string): Uint8Array;
}

export const env = createSafeEnv();

// Private

interface Env {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  SEAL_KEY?: string;
  BOT_TOKEN?: string;
  BOT_SECRET?: string;
  BLOB_READ_WRITE_TOKEN?: string;
}

declare global {
  namespace NodeJS {
    interface ProcessEnv extends Env {}
  }
}

function createSafeEnv(): SafeEnv {
  return new Proxy(process.env, {
    get(target, key): SafeEnvValue {
      if (typeof key !== "string") {
        throw new Error("Invalid environment variable key");
      }

      const getSafeEnvValue = (fallback?: string) => {
        const value = Reflect.get(target, key) ?? fallback;

        if (!value) {
          throw new Error(`Missing environment variable: "${key}"`);
        }

        return value;
      };

      getSafeEnvValue.hex = (fallback?: string) => {
        const str = getSafeEnvValue(fallback);

        try {
          return hex.decode(str);
        } catch {
          throw new Error(`Environment variable "${key}" is not a hex string`);
        }
      };

      return getSafeEnvValue;
    },
  }) as unknown as SafeEnv;
}
