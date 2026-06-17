import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getConfiguredOwner } from "@/lib/owner";
import { buildDigest } from "@/lib/digest";
import { sendTelegram, hasTelegram } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 90;

// Constant-time secret check. Accepts the secret via `Authorization: Bearer <s>`
// or an `x-cron-secret` header.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled until a secret is configured
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Generate the owner's daily briefing and push it to Telegram. Triggered by an
// external cron (host crontab / compose sidecar) hitting this route on a schedule.
async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const owner = await getConfiguredOwner();
  if (!owner) {
    return NextResponse.json({ error: "No configured owner user found" }, { status: 500 });
  }

  const digest = await buildDigest(owner.id);
  if (!digest) {
    return NextResponse.json({ ok: true, sent: false, reason: "nothing to report" });
  }

  let sent = false;
  if (hasTelegram()) {
    await sendTelegram(digest);
    sent = true;
  }

  return NextResponse.json({ ok: true, sent, digest });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET allowed too, so a simple `curl` or uptime-cron can trigger it.
export async function GET(req: NextRequest) {
  return handle(req);
}
