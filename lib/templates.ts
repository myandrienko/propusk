import { bold, code, format, italic } from "@gramio/format";
import type { TelegramMessageEntity } from "wrappergram";
import type { ReadChallengeResult } from "../services/challenge.ts";
import { InlineKeyboard } from "@gramio/keyboards";

export interface MessageTemplate {
  text: string;
  entities: TelegramMessageEntity[];
  reply_markup?: InlineKeyboard;
}

export function challengeNotFound(): MessageTemplate {
  return format`
    ${bold`Invalid authentication code.`} Looks like you’ve sent an authentication code, but it doesn’t seem to be valid.
    
    There might be a typo in the code, or the code could had already expired.
  `;
}

export function prompt(challenge: ReadChallengeResult): MessageTemplate {
  return {
    ...format`
      ${bold`You’re about to sign in.`} Once confirmed, you’ll be signed in on ${italic`${challenge.clientHints}`}.
      
      Only confirm if this is your device, and the magic phrase matches what you see on screen:
      
      ${code`${challenge.mnemonic}`}
    `,
    reply_markup: new InlineKeyboard()
      .text("Sign In", `y:${challenge.token}`, { style: "success" })
      .text("Cancel", `n:${challenge.token}`, { style: "danger" }),
  };
}

export function promptExpired(): MessageTemplate {
  return format`
    ${bold`Authentication attempt has expired.`} If you still want to sign in, start over with a new authentication code.
  `;
}

export function promptConfirmed(): MessageTemplate {
  return {
    ...format`
      ${bold`You have signed in.`}
    `,
    reply_markup: new InlineKeyboard().text("Sign Out", "signout"),
  };
}

export function promptRejected(): MessageTemplate {
  return format`
    ${bold`Authentication attempt cancelled.`}
  `;
}

export function error(err: unknown): MessageTemplate {
  return format`
    ${bold`Something went wrong on our side.`} You can try again. The error was:
        
    ${code`${err instanceof Error ? err.message : "Unknown error"}`}
  `;
}
