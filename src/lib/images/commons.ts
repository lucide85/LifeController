// Keyless image search via the Wikimedia Commons API. Returns scaled thumbnail
// URLs plus license/author from extmetadata, so we can show attribution. Wikimedia
// requires a descriptive User-Agent but no API key. Complements (never replaces)
// user uploads — it won't have a specific used bike, but it's great for models,
// places and generic objects.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "LifeControllerBot/1.0 (+https://things.vikane.cloud)";
const TIMEOUT_MS = 8000;

export interface CommonsImage {
  title: string;
  thumbUrl: string;
  fullUrl: string;
  descriptionUrl: string;
  license: string | null;
  artist: string | null;
}

function stripHtml(s: string | undefined): string | null {
  if (!s) return null;
  const text = s
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

export async function searchCommons(query: string, limit = 6): Promise<CommonsImage[]> {
  const q = query.trim();
  if (!q) return [];

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: q,
    gsrnamespace: "6", // File: namespace
    gsrlimit: String(Math.min(limit, 10)),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let json: unknown;
  try {
    const res = await fetch(`${COMMONS_API}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch (err) {
    console.error("commons search failed:", err);
    return [];
  } finally {
    clearTimeout(timer);
  }

  const pages = (json as { query?: { pages?: Record<string, unknown> } })?.query?.pages;
  if (!pages || typeof pages !== "object") return [];

  const out: CommonsImage[] = [];
  for (const page of Object.values(pages) as Array<{
    title?: string;
    imageinfo?: Array<{
      thumburl?: string;
      url?: string;
      descriptionurl?: string;
      extmetadata?: Record<string, { value?: string }>;
    }>;
  }>) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const meta = info.extmetadata ?? {};
    out.push({
      title: (page.title ?? "").replace(/^File:/, ""),
      thumbUrl: info.thumburl,
      fullUrl: info.url ?? info.thumburl,
      descriptionUrl: info.descriptionurl ?? "",
      license: stripHtml(meta.LicenseShortName?.value),
      artist: stripHtml(meta.Artist?.value),
    });
    if (out.length >= limit) break;
  }
  return out;
}
