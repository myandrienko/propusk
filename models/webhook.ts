import type {
  TelegramCallbackQuery,
  TelegramMaybeInaccessibleMessage,
  TelegramMessage,
  TelegramUpdate,
} from "wrappergram";
import { isValidChallengeCode } from "./challenge.ts";

export interface TgTextMessageUpdate extends TelegramUpdate {
  message: TgTextMessage;
}

export interface TgTextMessage extends TelegramMessage {
  text: string;
}

export interface TgDataCallbackUpdate extends TelegramUpdate {
  callback_query: TgDataCallbackQuery;
}

export interface TgDataCallbackQuery extends TelegramCallbackQuery {
  data: string;
  message: TelegramMaybeInaccessibleMessage;
}

export function isTextMessageUpdate(
  update: TelegramUpdate,
): update is TgTextMessageUpdate {
  return !!update.message?.text;
}

export function isDataCallbackUpdate(
  update: TelegramUpdate,
): update is TgDataCallbackUpdate {
  if (!update.callback_query) {
    return false;
  }

  const cq = update.callback_query;
  return cq.data !== undefined && cq.message !== undefined;
}
