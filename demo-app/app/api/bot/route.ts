import { NextResponse, type NextRequest } from "next/server";
import { handleTgUpdate } from "propusk/services/bot.ts";
import { env } from "propusk/lib/env.ts";

export async function POST(request: NextRequest): Promise<Response> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");

  if (secret !== env.BOT_SECRET()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await handleTgUpdate(await request.json());
  return new NextResponse("OK", { status: 200 });
}
