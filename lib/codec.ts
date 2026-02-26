import { Sealable } from "./seal.ts";

export function codec<const T extends string[]>(
  format: FormatFor<T>,
  ...args: T | [payload: Sealable]
): [...T, Sealable] {
  const decode = (value: string): T => {
    const parts: string[] = [];

    let start = 0;
    for (const length of format) {
      parts.push(value.slice(start, start + length));
      start += length;
    }

    return parts as T;
  };

  const encode = (...args: T): string => "".concat(...args);

  if (args[0] instanceof Sealable) {
    return [...decode(args[0].value), args[0]];
  }

  return [...(args as T), new Sealable(encode(...(args as T)))];
}

// Private

type FormatFor<T extends unknown[]> = { [K in keyof T]: number };
