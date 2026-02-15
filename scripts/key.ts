#!/usr/bin/env node

import { randomBytes } from "@noble/ciphers/utils.js";
import { base16 } from "@scure/base";

const arg = process.argv[2];
const length = arg ? Number.parseInt(arg, 10) : 32;

if (!Number.isInteger(length) || length <= 0) {
  console.error("Usage: key.ts [length]");
  process.exit(1);
}

console.log(base16.encode(randomBytes(length)));
