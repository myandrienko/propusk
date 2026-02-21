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

export interface PromptResponseUpdate extends TelegramUpdate {
  callback_query: PromptResponseCallbackQuery;
}

export interface PromptResponseCallbackQuery extends TelegramCallbackQuery {
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
  update.message.text = text; // dirty, but useful sideeffect
  return isValidChallengeCode(text);
}

export function isPromptResponseUpdate(
  update: TelegramUpdate,
): update is PromptResponseUpdate {
  if (!update.callback_query) {
    return false;
  }

  const cq = update.callback_query;
  return (
    cq.data !== undefined &&
    (cq.data.startsWith("y:") || cq.data.startsWith("n:")) &&
    cq.message !== undefined
  );
}
