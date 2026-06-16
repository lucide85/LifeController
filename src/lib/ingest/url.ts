// Dependency-free URL ingestion: fetch a pasted page server-side (with an SSRF
// guard — this app runs on a LAN, so we must never fetch private/internal hosts),
// pull out title / description / og:image and a rough readable-text body via
// regex, and download the hero image. No jsdom/readability (bundler-fragile);
// good-enough text that an LLM and embeddings can use.
import { lookup } from "node:dns/promises";

const USER_AGENT = "LifeControllerBot/1.0 (+https://things.vikane.cloud)";
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 9000;

// ── SSRF guard ──────────────────────────────────────────────────────────────────
function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → treat unsafe
  const [a, b] = p;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function ipIsPrivate(ip: string, family: number): boolean {
  if (family === 4) return ipv4IsPrivate(ip);
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true; // link-local / ULA
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (mapped) return ipv4IsPrivate(mapped[1]);
  return false;
}

// Parse + validate a URL, then resolve its host and reject private/internal IPs.
async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  const addrs = await lookup(u.hostname, { all: true });
  if (!addrs.length) throw new Error("Could not resolve host");
  for (const { address, family } of addrs) {
    if (ipIsPrivate(address, family)) {
      throw new Error("Refusing to fetch a private/internal address");
    }
  }
  return u;
}

// Fetch with manual redirect handling so every hop is SSRF-checked, plus a timeout.
//
// Residual risk (accepted for this single-owner LAN app): we validate the host's
// resolved IPs, then fetch by hostname, so Node re-resolves DNS for the actual
// connection — a DNS-rebinding attacker could return a public IP to our lookup()
// and a private/metadata IP to the fetch. Closing this fully requires pinning the
// connection to the validated IP via an undici Agent with a custom connect/lookup.
// TODO: harden with IP-pinning if this app ever becomes multi-tenant or public.
async function safeFetch(raw: string, accept: string): Promise<Response> {
  let target = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(target);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: accept },
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      target = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// ── Canonicalization ──────────────────────────────────────────────────────────
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_eid$|igshid$|ref$|ref_src$)/i;

export function canonicalizeUrl(raw: string): string | null {
  let input = raw.trim();
  if (!input) return null;
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  try {
    const u = new URL(input);
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    const keep: [string, string][] = [];
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAMS.test(k)) keep.push([k, v]);
    });
    u.search = "";
    for (const [k, v] of keep) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return null;
  }
}

// ── Metadata + text extraction (regex) ──────────────────────────────────────────
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function metaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return decodeEntities(m[1]).trim();
  }
  return null;
}

function extractMeta(html: string, baseUrl: string) {
  const head = html.slice(0, 200000); // metadata lives in <head>
  const title =
    metaContent(head, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    ]) ||
    metaContent(head, [/<title[^>]*>([^<]+)<\/title>/i]);
  const description = metaContent(head, [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ]);
  const rawImage = metaContent(head, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]);
  let imageUrl: string | null = null;
  if (rawImage) {
    try {
      imageUrl = new URL(rawImage, baseUrl).toString();
    } catch {
      imageUrl = null;
    }
  }
  return { title, description, imageUrl };
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export interface UrlContent {
  canonicalUrl: string;
  title: string | null;
  description: string | null;
  text: string;
  imageUrl: string | null;
}

export async function fetchUrlContent(rawUrl: string): Promise<UrlContent> {
  const canonical = canonicalizeUrl(rawUrl);
  if (!canonical) throw new Error("Invalid URL");

  const res = await safeFetch(canonical, "text/html,application/xhtml+xml");
  if (!res.ok) throw new Error(`Fetch failed (HTTP ${res.status})`);

  const contentType = res.headers.get("content-type") ?? "";
  if (!/text\/html|application\/xhtml|text\/plain/i.test(contentType)) {
    throw new Error("That URL is not an HTML page");
  }
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len && len > MAX_HTML_BYTES) throw new Error("Page is too large");

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_HTML_BYTES) throw new Error("Page is too large");
  const html = buf.toString("utf-8");

  const meta = extractMeta(html, canonical);
  const text = htmlToText(html);

  return {
    canonicalUrl: canonical,
    title: meta.title,
    description: meta.description,
    text,
    imageUrl: meta.imageUrl,
  };
}

// Download a (hero) image with the same SSRF guard + size/type validation.
export async function downloadImage(
  rawUrl: string
): Promise<{ buffer: Buffer; mimeType: string; fileName: string } | null> {
  try {
    const res = await safeFetch(rawUrl, "image/*");
    if (!res.ok) return null;
    const mimeType = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!mimeType.startsWith("image/")) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len && len > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES || buffer.byteLength === 0) return null;
    const extFromType = mimeType.split("/")[1]?.split("+")[0] || "jpg";
    let base = "image";
    try {
      base = new URL(rawUrl).pathname.split("/").pop()?.split(".")[0] || "image";
    } catch {
      /* keep default */
    }
    return { buffer, mimeType, fileName: `${base}.${extFromType}`.slice(0, 80) };
  } catch (err) {
    console.error("downloadImage failed:", err);
    return null;
  }
}
