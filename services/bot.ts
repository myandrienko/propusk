import type { TelegramUpdate, TelegramUser } from "wrappergram";
import { ConflictError, NotFoundError } from "../lib/errors.ts";
import { pick } from "../lib/random.ts";
import * as templates from "./templates.ts";
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
import { InvalidSealedValueError } from "../lib/seal.ts";

export async function handleTgUpdate(update: TelegramUpdate): Promise<boolean> {
  const tg = getTg();
  let chatId: number | undefined;

  try {
    if (isTextMessageUpdate(update)) {
      chatId = update.message.chat.id;
      const text = update.message.text.trim();

      const code = text.startsWith("/start ")
        ? text.slice("/start ".length).trim()
        : text;

      if (isValidChallengeCode(code)) {
        return await handleChallengeCode(update, code);
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

  const mnemonic = res.ref.getMnemonic();
  const verifiers = pick([...mnemonic], 3);

  await tg.api.sendMessage({
    chat_id: update.message.chat.id,
    ...templates.prompt({
      clientHints: res.challenge.clientHints,
      token: res.ref.getToken(),
      verifiers,
      hint: mnemonic.indexOf(verifiers[0]),
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
      case "w:":
      case "n:":
        return await handlePromptFailed(cq, cq.data.slice(2), {
          reason: cq.data[0] === "w" ? "unverified" : "rejected",
        });
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

  try {
    const challengeRef = ChallengeRef.fromToken(token);
    const userInit = await fromTgUser(cq.from);
    const res = await passChallenge(challengeRef, userInit);
    const sessionToken = res.provisionalSessionRef.getToken();
    await tg.api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      ...templates.promptConfirmed(sessionToken),
    });
  } catch (err) {
    if (
      err instanceof NotFoundError ||
      err instanceof ConflictError ||
      err instanceof InvalidSealedValueError
    ) {
      await handleTokenExpired(cq);
    } else {
      throw err;
    }
  }

  return true;
}

async function handlePromptFailed(
  cq: TgDataCallbackQuery,
  token: string,
  { reason }: { reason: "rejected" | "unverified" },
): Promise<true> {
  const tg = getTg();

  try {
    const challengeRef = ChallengeRef.fromToken(token);
    await deleteChallenge(challengeRef);
    await tg.api.editMessageText({
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      ...(reason === "unverified"
        ? templates.promptUnverified()
        : templates.promptRejected()),
    });
  } catch (err) {
    if (
      err instanceof NotFoundError ||
      err instanceof InvalidSealedValueError
    ) {
      await handleTokenExpired(cq);
    } else {
      throw err;
    }
  }
  return true;
}

async function handleTokenExpired(cq: TgDataCallbackQuery) {
  const tg = getTg();
  await tg.api.editMessageText({
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    ...templates.promptExpired(),
  });
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

async function fromTgUser(tgu: TelegramUser): Promise<{
  userRef: UserRef;
  user: User;
}> {
  const userRef = new UserRef(tgu.id);
  const image = await hostUserPhoto(userRef);
  const name = [tgu.first_name, tgu.last_name].filter(Boolean).join(" ");
  const lang = tgu.language_code ?? "en";
  return {
    userRef: new UserRef(tgu.id),
    user: { name, lang, image },
  };
}
