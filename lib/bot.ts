import type {
  TelegramCallbackQuery,
  TelegramMaybeInaccessibleMessage,
  TelegramMessage,
  TelegramUpdate,
} from "wrappergram";
import {
  ChallengeConflictError,
  ChallengeNotFoundError,
  deleteChallenge,
  passChallenge,
  readChallenge,
  type ReadChallengeResult,
} from "./challenge.ts";
import { isValidChallengeCode } from "../models/challenge.ts";
import { hostUserPhoto } from "./photos.ts";
import * as templates from "./templates.ts";
import { getTg } from "./tg.ts";
import { UserRef, type User } from "../models/user.ts";

export async function handleTgUpdate(update: TelegramUpdate): Promise<boolean> {
  const tg = getTg();
  let chatId: number | undefined;

  try {
    if (isChallengeCodeUpdate(update)) {
      chatId = update.message.chat.id;
      await handleChallengeCode(update);
      return true;
    }

    if (isPromptResponseUpdate(update)) {
      chatId = update.callback_query.message.chat.id;
      await handlePromptResponse(update);
      return true;
    }
  } catch (err) {
    if (chatId) {
      await tg.api.sendMessage({
        chat_id: chatId,
        ...templates.error(err),
      });
    }

    return true;
  }

  return false;
}

// Private

interface ChallengeCodeUpdate extends TelegramUpdate {
  message: ChallengeCodeMessage;
}

interface ChallengeCodeMessage extends TelegramMessage {
  text: string;
}

interface PromptResponseUpdate extends TelegramUpdate {
  callback_query: PromptResponseCallbackQuery;
}

interface PromptResponseCallbackQuery extends TelegramCallbackQuery {
  data: string;
  message: TelegramMaybeInaccessibleMessage;
}

function isChallengeCodeUpdate(
  update: TelegramUpdate,
): update is ChallengeCodeUpdate {
  if (!update.message?.text) {
    return false;
  }

  const text = update.message.text.trim();
  update.message.text = text; // dirty, but useful sideeffect
  return isValidChallengeCode(text);
}

function isPromptResponseUpdate(
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

async function handleChallengeCode(update: ChallengeCodeUpdate): Promise<void> {
  const tg = getTg();
  let res: ReadChallengeResult;

  try {
    res = await readChallenge(update.message.text);
  } catch (err) {
    if (err instanceof ChallengeNotFoundError) {
      await tg.api.sendMessage({
        chat_id: update.message.chat.id,
        ...templates.challengeNotFound(),
      });
      return;
    }

    throw err;
  }

  await tg.api.sendMessage({
    chat_id: update.message.chat.id,
    ...templates.prompt(res),
  });
}

async function handlePromptResponse(
  update: PromptResponseUpdate,
): Promise<void> {
  const tg = getTg();
  const cq = update.callback_query;
  const [action, token] = cq.data.split(":");

  try {
    await (action === "y"
      ? handlePromptConfirm(cq, token)
      : handlePromptReject(cq, token));
  } finally {
    await tg.api.answerCallbackQuery({ callback_query_id: cq.id });
  }
}

async function handlePromptConfirm(
  cq: PromptResponseCallbackQuery,
  token: string,
): Promise<void> {
  const tg = getTg();
  const ref = new UserRef(cq.from.id);

  try {
    const user: User = {
      id: ref.getPublicId(),
      name: [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" "),
      lang: cq.from.language_code ?? "en",
      image: await hostUserPhoto(ref),
    };

    await passChallenge(token, user);
  } catch (err) {
    if (
      err instanceof ChallengeNotFoundError ||
      err instanceof ChallengeConflictError
    ) {
      await tg.api.editMessageText({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        ...templates.promptExpired(),
      });

      return;
    }

    throw err;
  }

  await tg.api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    ...templates.promptConfirmed(),
  });
}

async function handlePromptReject(
  cq: PromptResponseCallbackQuery,
  token: string,
): Promise<void> {
  const tg = getTg();
  await deleteChallenge(token);
  await tg.api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    ...templates.promptRejected(),
  });
}
