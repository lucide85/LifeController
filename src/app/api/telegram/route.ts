import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getConfiguredOwner } from "@/lib/owner";
import { ingestCapture, describeSuggestion } from "@/lib/ingest/capture";
import { sendTelegram, tgDownloadFile } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_URL = process.env.NEXTAUTH_URL || process.env.APP_URL || "";

// In-process dedupe of Telegram retries (it re-delivers the same update_id until
// it gets a timely 200, and our processing can be slow). Good enough for a single
// long-lived container; it doesn't need to survive restarts.
const seenUpdates = new Set<number>();

function secretOk(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false; // bot disabled until a secret is configured
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Telegram webhook. The bot is a single-user capture endpoint: message it (text,
// link, photo or document) and it files the item into the capture inbox, then
// replies with what triage proposed. Security: a webhook secret token + a check
// that the message comes from the one allowed chat id.
export async function POST(req: NextRequest) {
  // 1) Mandatory webhook-secret check (constant-time). The chat-id allowlist below
  // is NOT authentication — chat ids are low-entropy and attacker-supplied in the
  // body — so without the secret the bot stays disabled.
  if (!secretOk(req)) return NextResponse.json({ ok: true }); // ignore quietly

  const update = await req.json().catch(() => null);

  // Dedupe retries before doing any work.
  const updateId = update?.update_id;
  if (typeof updateId === "number") {
    if (seenUpdates.has(updateId)) return NextResponse.json({ ok: true });
    seenUpdates.add(updateId);
    if (seenUpdates.size > 1000) seenUpdates.clear();
  }

  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id;
  if (!message || chatId === undefined) return NextResponse.json({ ok: true });

  // 2) Only accept messages from the configured owner chat.
  const allowed = process.env.TELEGRAM_CHAT_ID;
  if (!allowed || String(chatId) !== String(allowed)) {
    return NextResponse.json({ ok: true });
  }

  const owner = await getConfiguredOwner();
  if (!owner) {
    await sendTelegram("⚠️ Capture failed: no owner account is configured.", String(chatId));
    return NextResponse.json({ ok: true });
  }

  try {
    // 3) Build the capture input from whatever was sent.
    let result;
    const text: string | undefined = message.text || message.caption;

    if (Array.isArray(message.photo) && message.photo.length) {
      // photo is an array of sizes; the last is the largest.
      const fileId = message.photo[message.photo.length - 1].file_id;
      const file = await tgDownloadFile(fileId);
      if (!file) throw new Error("could not download the photo");
      if (!/\.\w+$/.test(file.fileName)) file.fileName += ".jpg";
      result = await ingestCapture({ ownerId: owner.id, file });
    } else if (message.document) {
      const file = await tgDownloadFile(message.document.file_id);
      if (!file) throw new Error("could not download the file");
      if (message.document.file_name) file.fileName = message.document.file_name;
      result = await ingestCapture({ ownerId: owner.id, file });
    } else if (message.voice || message.audio) {
      const media = message.voice || message.audio;
      const file = await tgDownloadFile(media.file_id);
      if (!file) throw new Error("could not download the audio");
      result = await ingestCapture({ ownerId: owner.id, file });
    } else if (text && /^https?:\/\/\S+$/i.test(text.trim())) {
      result = await ingestCapture({ ownerId: owner.id, url: text.trim() });
    } else if (text && text.trim()) {
      result = await ingestCapture({ ownerId: owner.id, text: text.trim() });
    } else {
      await sendTelegram("Send me text, a link, a photo or a file and I'll file it.", String(chatId));
      return NextResponse.json({ ok: true });
    }

    if (!result) return NextResponse.json({ ok: true });
    const where = APP_URL ? `\n${APP_URL.replace(/\/$/, "")}/inbox` : "";
    await sendTelegram(
      `✅ Saved to your inbox.\nSuggested: ${describeSuggestion(result.suggestion)}.${where}`,
      String(chatId)
    );
  } catch (err) {
    console.error("telegram capture failed:", err);
    const detail = err instanceof Error ? err.message : "something went wrong";
    await sendTelegram(`⚠️ Couldn't save that: ${detail}`, String(chatId));
  }

  return NextResponse.json({ ok: true });
}
