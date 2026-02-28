import type {
  TelegramCallbackQuery,
  TelegramMaybeInaccessibleMessage,
  TelegramMessage,
  TelegramUpdate,
} from "wrappergram";
import { isValidChallengeCode } from "./challenge.ts";

export interface ChallengeCodeUpdate extends TelegramUpdate {
  message: ChallengeCodeMessage;
}

export interface ChallengeCodeMessage extends TelegramMessage {
  text: string;
}

export interface TaggedCallbackUpdate extends TelegramUpdate {
  callback_query: TaggedCallbackQuery;
}

export interface TaggedCallbackQuery extends TelegramCallbackQuery {
  data: string;
  message: TelegramMaybeInaccessibleMessage;
}

export function isChallengeCodeUpdate(
  update: TelegramUpdate,
): update is ChallengeCodeUpdate {
  if (!update.message?.text) {
    return false;
  }

  const text = update.message.text.trim();
  update.message.text = text; // dirty, but useful side effect
  return isValidChallengeCode(text);
}

export function isPromptCallbackUpdate(
  update: TelegramUpdate,
): update is TaggedCallbackUpdate {
  if (!isCallbackUpdate(update)) {
    return false;
  }

  const cq = update.callback_query;
  return cq.data.startsWith("y:") || cq.data.startsWith("n:");
}

export function isSignOutCallbackUpdate(
  update: TelegramUpdate,
): update is TaggedCallbackUpdate {
  return (
    isCallbackUpdate(update) && update.callback_query.data.startsWith("d:")
  );
}

// Private

function isCallbackUpdate(
  update: TelegramUpdate,
): update is TaggedCallbackUpdate {
  if (!update.callback_query) {
    return false;
  }

  const cq = update.callback_query;
  return cq.data !== undefined && cq.message !== undefined;
}
