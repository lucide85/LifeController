import { NextRequest, NextResponse } from "next/server";
import { getApprovedUserOrNull } from "@/lib/auth-guard";
import { ingestCapture } from "@/lib/ingest/capture";

export const runtime = "nodejs";
export const maxDuration = 120;

// 303 redirect with a RELATIVE Location, so the browser resolves it against the PWA's
// own origin — correct even behind the Traefik reverse proxy (no hard-coded host).
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

function firstUrlIn(text: string): string | null {
  const m = text.match(/https?:\/\/\S+/i);
  return m ? m[0] : null;
}

// Web Share Target endpoint (registered in public/manifest.json). When the owner taps
// "Share → LifeController" from any app, the browser POSTs the shared text / url / files
// here (multipart). We funnel them through the same ingestCapture pipeline as the inbox
// and the Telegram bot, then redirect to /inbox so the owner sees the triaged result.
export async function POST(req: NextRequest) {
  const user = await getApprovedUserOrNull();
  // Not signed in on this device → send to sign-in (the share is lost, but safe).
  if (!user) return seeOther("/signin");

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error("share target: could not parse form data:", err);
    return seeOther("/inbox?shared=error");
  }

  const title = ((form.get("title") as string | null) ?? "").trim();
  const text = ((form.get("text") as string | null) ?? "").trim();
  const url = ((form.get("url") as string | null) ?? "").trim();
  const files = form
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);

  const maxMb = Number(process.env.MAX_UPLOAD_MB ?? 25);
  let ingestedAny = false;
  let failures = 0;

  // Prefer shared files (photos, PDFs…). Each ingest commits independently, so isolate
  // every file: a corrupt/oversize one must not abort the rest or mislabel a partial save.
  for (const f of files) {
    if (f.size > maxMb * 1024 * 1024) {
      failures++;
      continue;
    }
    try {
      await ingestCapture({
        ownerId: user.id,
        file: {
          buffer: Buffer.from(await f.arrayBuffer()),
          fileName: f.name || "shared",
          mimeType: f.type || "application/octet-stream",
        },
      });
      ingestedAny = true;
    } catch (err) {
      console.error("share target: file ingest failed:", err);
      failures++;
    }
  }

  // No files → a shared link (in `url`, or embedded in `text`), else plain text/note.
  if (!ingestedAny) {
    const sharedUrl = url || (text ? firstUrlIn(text) : null);
    try {
      if (sharedUrl) {
        await ingestCapture({ ownerId: user.id, url: sharedUrl });
        ingestedAny = true;
      } else {
        const body = [title, text].filter(Boolean).join("\n").trim();
        if (body) {
          await ingestCapture({ ownerId: user.id, text: body });
          ingestedAny = true;
        }
      }
    } catch (err) {
      console.error("share target: link/text ingest failed:", err);
      return seeOther("/inbox?shared=error");
    }
  }

  if (!ingestedAny) return seeOther("/inbox?shared=empty");
  // At least one saved; flag a partial if some files were skipped/failed.
  return seeOther(failures > 0 ? "/inbox?shared=partial" : "/inbox?shared=1");
}
