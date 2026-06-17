// Minimal Telegram Bot API client. The bot is both a capture endpoint (you message
// it; the webhook files it) and the notification channel (digests, confirmations).
// Single-user: one bot token + one allowed chat id, set via env.
const TELEGRAM_API = (method: string) =>
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export function hasTelegram(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// Send a plain-text message (no parse_mode, so arbitrary content can't break it).
export async function sendTelegram(text: string, chatId?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = chatId ?? process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch(TELEGRAM_API("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        text: text.slice(0, 4000),
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    console.error("sendTelegram failed:", err);
  }
}

// Download a file the user sent the bot (photo/document/voice), size-capped. The
// Telegram file host is fixed (api.telegram.org), so no SSRF surface here.
export async function tgDownloadFile(
  fileId: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024;
  try {
    const infoRes = await fetch(`${TELEGRAM_API("getFile")}?file_id=${encodeURIComponent(fileId)}`);
    const info = await infoRes.json();
    const filePath: string | undefined = info?.result?.file_path;
    if (!filePath) return null;

    const dl = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!dl.ok) return null;
    const len = Number(dl.headers.get("content-length") ?? 0);
    if (len && len > maxBytes) return null;
    const buffer = Buffer.from(await dl.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) return null;

    const fileName = (filePath.split("/").pop() || "file").slice(0, 100);
    const mimeType = (dl.headers.get("content-type") ?? "application/octet-stream").split(";")[0];
    return { buffer, fileName, mimeType };
  } catch (err) {
    console.error("tgDownloadFile failed:", err);
    return null;
  }
}
