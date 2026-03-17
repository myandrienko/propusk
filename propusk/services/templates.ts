import { bold, code, format, italic } from "@gramio/format";
import { InlineKeyboard } from "@gramio/keyboards";
import type { TelegramMessageEntity } from "wrappergram";
import { pick } from "../lib/random.ts";

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

export function prompt(vars: {
  clientHints?: string;
  token: string;
  verifiers: string[];
  hint: number;
}): MessageTemplate {
  const verifier = vars.verifiers[0];

  return {
    ...format`
      ${bold`You’re about to sign in.`} Once confirmed, you’ll be signed in on ${italic`${vars.clientHints}`}.

      To confirm, press the button matching the ${bold`${ordinal(vars.hint + 1)}`} word in the magic phrase.
    `,
    reply_markup: new InlineKeyboard()
      .add(
        ...pick(vars.verifiers).map((word) =>
          InlineKeyboard.text(
            word,
            `${word === verifier ? "y" : "w"}:${vars.token}`,
            { style: "primary" },
          ),
        ),
      )
      .row()
      .text("Cancel", `n:${vars.token}`),
  };
}

export function promptExpired(): MessageTemplate {
  return format`
    ${bold`Authentication attempt has expired.`} If you still want to sign in, start over with a new authentication code.
  `;
}

export function promptConfirmed(token: string): MessageTemplate {
  return {
    ...format`
      ${bold`You have signed in.`}
    `,
    reply_markup: new InlineKeyboard().text("Sign Out", `d:${token}`),
  };
}

export function promptUnverified(): MessageTemplate {
  return format`
    ${bold`Authentication attempt cancelled.`} Your pick didn’t match the magic phrase. If you still want to sign in, start over with a new authentication code.
  `;
}

export function promptRejected(): MessageTemplate {
  return format`
    ${bold`Authentication attempt cancelled.`}
  `;
}

export function signedOut(): MessageTemplate {
  return format`
    ${bold`You have signed out.`}
  `;
}

export function error(err: unknown): MessageTemplate {
  return format`
    ${bold`Something went wrong on our side.`} You can try again. The error was:
        
    ${code`${err instanceof Error ? err.message : "Unknown error"}`}
  `;
}

// Private

function ordinal(n: number): string {
  const suffixes: Partial<Record<Intl.LDMLPluralRule, string>> = {
    one: "st",
    two: "nd",
    few: "rd",
    other: "th",
  };

  return `${n}${
    suffixes[new Intl.PluralRules("en-US", { type: "ordinal" }).select(n)]
  }`;
}
