import { hex } from "@scure/base";
import { e } from "./try.ts";

export type SafeEnv = {
  [K in keyof NodeJS.ProcessEnv]-?: SafeEnvValue;
};

export interface SafeEnvValue {
  (): string;
  hex(size?: number): Uint8Array;
}

export const env = createSafeEnv();

// Private

interface Env {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  SEAL_KEY?: string;
  JWT_SECRET?: string;
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

      const getSafeEnvValue = () => {
        const value = Reflect.get(target, key);

        if (!value) {
          throw new Error(`Missing environment variable: "${key}"`);
        }

        return value;
      };

      getSafeEnvValue.hex = (size?: number) => {
        const str = getSafeEnvValue();
        const bytes = e.try(
          () => hex.decode(str),
          () => new Error(`Environment variable "${key}" is not a hex string`),
        );

        if (typeof size === "number" && bytes.length !== size) {
          throw new Error("Key must have length 32");
        }

        return bytes;
      };

      return getSafeEnvValue;
    },
  }) as unknown as SafeEnv;
}
