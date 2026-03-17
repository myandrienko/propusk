import { Telegram } from "wrappergram";
import { env } from "./env.ts";

let tg: Telegram | undefined;

export function getTg(): Telegram {
  if (!tg) {
    tg = new Telegram(env.BOT_TOKEN());
  }

  return tg;
}
