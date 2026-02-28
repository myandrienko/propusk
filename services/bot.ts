import type { TelegramUpdate } from "wrappergram";
import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { hostUserPhoto } from "../lib/photos.ts";
import * as templates from "../lib/templates.ts";
import { getTg } from "../lib/tg.ts";
import { UserRef, type User } from "../models/user.ts";
import {
  isChallengeCodeUpdate,
  isPromptCallbackUpdate,
  isSignOutCallbackUpdate,
  type ChallengeCodeUpdate,
  type TaggedCallbackQuery,
  type TaggedCallbackUpdate,
} from "../models/webhook.ts";
import {
  deleteChallenge,
  passChallenge,
  readChallenge,
  type ReadChallengeResult,
} from "./challenge.ts";
import { deleteSession } from "./session.ts";

export async function handleTgUpdate(update: TelegramUpdate): Promise<boolean> {
  const tg = getTg();
  let chatId: number | undefined;

  try {
    if (isChallengeCodeUpdate(update)) {
      chatId = update.message.chat.id;
      await handleChallengeCode(update);
      return true;
    }

    if (isPromptCallbackUpdate(update)) {
      chatId = update.callback_query.message.chat.id;
      await handlePromptResponse(update);
      return true;
    }

    if (isSignOutCallbackUpdate(update)) {
      chatId = update.callback_query.message.chat.id;
      await handleSignOut(update);
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
    if (err instanceof NotFoundError) {
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
  update: TaggedCallbackUpdate,
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
  cq: TaggedCallbackQuery,
  token: string,
): Promise<void> {
  const tg = getTg();
  const userRef = UserRef.fromTgId(cq.from.id);

  const user: User = {
    id: userRef.id,
    name: [cq.from.first_name, cq.from.last_name].filter(Boolean).join(" "),
    lang: cq.from.language_code ?? "en",
    image: await hostUserPhoto(userRef),
  };

  const res = await passChallenge(token, user).catch(async (err) => {
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      await tg.api.editMessageText({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        ...templates.promptExpired(),
      });

      return null;
    }

    throw err;
  });

  if (res) {
    await tg.api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      ...templates.promptConfirmed(res.provisionalSessionToken),
    });
  }
}

async function handlePromptReject(
  cq: TaggedCallbackQuery,
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

async function handleSignOut(update: TaggedCallbackUpdate): Promise<void> {
  const tg = getTg();
  const cq = update.callback_query;
  const [, token] = cq.data.split(":");

  try {
    await deleteSession(token);
    await tg.api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      ...templates.signedOut(),
    });
  } finally {
    await tg.api.answerCallbackQuery({ callback_query_id: cq.id });
  }
}
