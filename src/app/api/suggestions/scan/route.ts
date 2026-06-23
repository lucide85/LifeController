import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { getConfiguredOwner } from "@/lib/owner";
import { generateSuggestions } from "@/lib/ai/suggest";

export const runtime = "nodejs";
export const maxDuration = 300;

// Constant-time secret check for the scheduled (cron) trigger. Accepts the secret
// via `x-cron-secret` or `Authorization: Bearer <s>` — same convention as the digest.
function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Single-flight guard: a scan can be slow (per-item vector queries + a few AI calls),
// so don't let a manual "Scan now" overlap a cron run on the one container.
let scanning = false;

// Run the proactive-suggestions sweep for the owner and persist new proposals.
// Two ways in: the in-app "Scan now" button (an approved session) or the host cron
// (the CRON_SECRET, resolving to the single configured owner).
async function handle(req: NextRequest) {
  let ownerId: string;
  if (cronAuthorized(req)) {
    const owner = await getConfiguredOwner();
    if (!owner) {
      return NextResponse.json({ error: "No configured owner user found" }, { status: 500 });
    }
    ownerId = owner.id;
  } else {
    const user = await getApprovedUserOrNull();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    ownerId = user.id;
  }

  if (scanning) {
    return NextResponse.json(
      { ok: false, busy: true, error: "A scan is already running" },
      { status: 409 }
    );
  }
  scanning = true;
  try {
    const result = await generateSuggestions(ownerId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("suggestions scan failed:", err);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  } finally {
    scanning = false;
  }
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET allowed too, so a simple cron `curl` can trigger it.
export async function GET(req: NextRequest) {
  return handle(req);
}
