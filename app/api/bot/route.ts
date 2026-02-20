import type { TelegramUpdate } from "wrappergram";
import { env } from "../../../lib/env.ts";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (secret !== env("BOT_SECRET")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const update: TelegramUpdate = await request.json();
  console.log("Telegram update:", update);
  return new NextResponse("OK", { status: 200 });
}
