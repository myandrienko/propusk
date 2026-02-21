import type { TelegramUpdate } from "wrappergram";
import { NextResponse, type NextRequest } from "next/server";
import { handleTgUpdate } from "../../../lib/bot.ts";
import { env } from "../../../lib/env.ts";

export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (secret !== env.BOT_SECRET()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  await handleTgUpdate(update);
  return new NextResponse("OK", { status: 200 });
}
