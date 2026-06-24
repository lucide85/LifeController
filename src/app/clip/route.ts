import { NextRequest, NextResponse } from "next/server";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { ingestCapture } from "@/lib/ingest/capture";

export const runtime = "nodejs";
export const maxDuration = 120;

// 303 with a RELATIVE Location → resolved against this origin, proxy-safe behind Traefik.
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

// Web-clipper endpoint. A bookmarklet on the owner's browser navigates here with the
// current page URL (?u=) and title (?t=); we file it through the same ingest pipeline as
// the inbox / share target / Telegram bot, then redirect to the inbox. GET (not POST) so a
// bookmarklet `location.href=…` works; it mutates, which is acceptable for a personal,
// single-owner clip action gated behind an authenticated session.
export async function GET(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  if (!user) return seeOther("/signin");

  const u = (req.nextUrl.searchParams.get("u") ?? "").trim();
  const t = (req.nextUrl.searchParams.get("t") ?? "").trim();

  if (!u || !/^https?:\/\//i.test(u)) {
    return seeOther("/inbox?shared=empty");
  }

  try {
    await ingestCapture({ ownerId: user.id, url: u });
  } catch (err) {
    console.error("clip ingest failed:", err);
    // Don't lose the clip — fall back to saving the title + URL as a plain note.
    try {
      await ingestCapture({ ownerId: user.id, text: [t, u].filter(Boolean).join("\n") });
    } catch {
      return seeOther("/inbox?shared=error");
    }
  }
  return seeOther("/inbox?shared=1");
}
