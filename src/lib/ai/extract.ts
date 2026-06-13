// Extract searchable text from an uploaded file. PDFs are parsed; plain text is
// read directly; images are described by Claude vision when available (so a photo
// of a receipt or a serial-number sticker becomes searchable text).
import { getAnthropic, getModel, hasAnthropic } from "./anthropic";

export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  try {
    if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
      // Import the inner module directly: the package's index.js has a debug
      // branch that tries to read a bundled test PDF when `module.parent` is
      // falsy, which crashes under bundlers. The lib entry avoids that.
      const mod = await import("pdf-parse/lib/pdf-parse.js");
      const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buffer);
      return data.text?.trim() ?? "";
    }

    if (mimeType.startsWith("text/") || /\.(txt|md|csv|json|log)$/i.test(fileName)) {
      return buffer.toString("utf-8").slice(0, 50000);
    }

    if (mimeType.startsWith("image/") && hasAnthropic()) {
      return await describeImage(buffer, mimeType);
    }
  } catch (err) {
    console.error("extractText failed for", fileName, err);
  }
  return "";
}

async function describeImage(buffer: Buffer, mimeType: string): Promise<string> {
  const anthropic = getAnthropic();
  const media = (
    ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mimeType)
      ? mimeType
      : "image/jpeg"
  ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: media, data: buffer.toString("base64") },
          },
          {
            type: "text",
            text:
              "Transcribe and describe this image so it can be found later by search. " +
              "Capture any visible text verbatim (brand, model, serial numbers, dates, " +
              "amounts, totals on receipts), then add a one-line description of what it shows.",
          },
        ],
      },
    ],
  });

  return res.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
