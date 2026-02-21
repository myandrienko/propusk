import type { TelegramUpdate } from "wrappergram";
import { hostUserPhoto } from "../lib/photos.ts";
import * as templates from "../lib/templates.ts";
import { getTg } from "../lib/tg.ts";
import { UserRef, type User } from "../models/user.ts";
import {
  isChallengeCodeUpdate,
  isPromptResponseUpdate,
  type ChallengeCodeUpdate,
  type PromptResponseCallbackQuery,
  type PromptResponseUpdate,
} from "../models/webhook.ts";
import {
  ChallengeConflictError,
  ChallengeNotFoundError,
  deleteChallenge,
  passChallenge,
  readChallenge,
  type ReadChallengeResult,
} from "./challenge.ts";

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
