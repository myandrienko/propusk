import type { TelegramUpdate, TelegramUser } from "wrappergram";
import { ConflictError, NotFoundError } from "../lib/errors.ts";
import * as templates from "../lib/templates.ts";
import { getTg } from "../lib/tg.ts";
import { ChallengeRef, isValidChallengeCode } from "../models/challenge.ts";
import { SessionRef } from "../models/session.ts";
import { UserRef, type User } from "../models/user.ts";
import {
  isDataCallbackUpdate,
  isTextMessageUpdate,
  type TgDataCallbackQuery,
  type TgTextMessageUpdate,
} from "../models/webhook.ts";
import { hostUserPhoto } from "../services/photos.ts";
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
    if (isTextMessageUpdate(update)) {
      chatId = update.message.chat.id;
      const text = update.message.text.trim();

      if (isValidChallengeCode(text)) {
        return await handleChallengeCode(update, text);
      }
    }

    if (isDataCallbackUpdate(update)) {
      const cq = update.callback_query;
      chatId = cq.message.chat.id;
      return await handleCallback(cq);
    }
  } catch (err) {
    console.error(err);

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

async function handleChallengeCode(
  update: TgTextMessageUpdate,
  code: string,
): Promise<true> {
  const tg = getTg();
  let res: ReadChallengeResult;

  try {
    res = await readChallenge(code);
  } catch (err) {
    if (err instanceof NotFoundError) {
      await tg.api.sendMessage({
        chat_id: update.message.chat.id,
        ...templates.challengeNotFound(),
      });
      return true;
    }

    throw err;
  }

  await tg.api.sendMessage({
    chat_id: update.message.chat.id,
    ...templates.prompt({
      clientHints: res.challenge.clientHints,
      mnemonic: res.ref.getMnemonic(),
      token: res.ref.getToken(),
    }),
  });
  return true;
}

async function handleCallback(cq: TgDataCallbackQuery): Promise<boolean> {
  const tg = getTg();

  try {
    switch (cq.data.slice(0, 2)) {
      case "y:":
        return await handlePromptConfirm(cq, cq.data.slice(2));
      case "n:":
        return await handlePromptReject(cq, cq.data.slice(2));
      case "d:":
        return await handleSignOut(cq, cq.data.slice(2));
      default:
        return false;
    }
  } finally {
    await tg.api.answerCallbackQuery({ callback_query_id: cq.id });
  }
}

async function handlePromptConfirm(
  cq: TgDataCallbackQuery,
  token: string,
): Promise<true> {
  const tg = getTg();
  const challengeRef = ChallengeRef.fromToken(token);
  const user = await fromTgUser(cq.from);

  try {
    const res = await passChallenge(challengeRef, user);
    const sessionToken = res.provisionalSessionRef.getToken();
    await tg.api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      ...templates.promptConfirmed(sessionToken),
    });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof ConflictError) {
      await tg.api.editMessageText({
        chat_id: cq.message.chat.id,
        message_id: cq.message.message_id,
        ...templates.promptExpired(),
      });
    } else {
      throw err;
    }
  }

  return true;
}

async function handlePromptReject(
  cq: TgDataCallbackQuery,
  token: string,
): Promise<true> {
  const tg = getTg();
  const challengeRef = ChallengeRef.fromToken(token);
  await deleteChallenge(challengeRef);
  await tg.api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    ...templates.promptRejected(),
  });
  return true;
}

async function handleSignOut(
  cq: TgDataCallbackQuery,
  token: string,
): Promise<true> {
  const tg = getTg();
  const sessionRef = SessionRef.fromToken(token);
  await deleteSession(sessionRef);
  await tg.api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    ...templates.signedOut(),
  });
  return true;
}

async function fromTgUser(tgUser: TelegramUser): Promise<User> {
  const userRef = UserRef.fromTgId(tgUser.id);
  const image = await hostUserPhoto(userRef);
  const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ");
  const lang = tgUser.language_code ?? "en";
  return { tgId: tgUser.id, name, lang, image };
}
