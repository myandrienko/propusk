#!/usr/bin/env -S node --env-file=.env

import { env } from "../lib/env.ts";
import { getTg } from "../lib/tg.ts";

const url = process.argv[2];

if (!url) {
  console.error("Usage: webhook.ts <url>");
  process.exit(1);
}

const webhook = `${url}/api/bot`;

const response = await getTg().api.setWebhook({
  url: webhook,
  secret_token: env.BOT_SECRET(),
});

if (!response.ok) {
  console.error(
    `Failed to set bot webhook ${response.error_code}: ${response.description}`,
  );
  process.exit(1);
}

console.log(`Webhook set to ${webhook}`);
