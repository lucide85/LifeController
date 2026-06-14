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
      const { default: pdfParse } = await import("pdf-parse/lib/pdf-parse.js");
      let text = "";
      try {
        const data = await pdfParse(buffer);
        text = data.text?.trim() ?? "";
      } catch (err) {
        console.error("pdf-parse failed for", fileName, err);
      }

      // Scanned / image-only PDFs have little or no text layer, so pdf-parse
      // returns ~nothing. Fall back to Claude, which reads PDF pages (including
      // scans) natively. Bounded by size so we don't push a huge file to the API.
      const MAX_PDF_OCR_BYTES = 18 * 1024 * 1024;
      if (text.length < 40 && hasAnthropic() && buffer.byteLength <= MAX_PDF_OCR_BYTES) {
        const ocr = await transcribePdfWithClaude(buffer);
        if (ocr) return ocr;
      }
      return text;
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

// OCR/transcribe a PDF (including scanned, image-only PDFs) via Claude's native
// PDF document support. Returns the readable text, or "" on failure.
async function transcribePdfWithClaude(buffer: Buffer): Promise<string> {
  const anthropic = getAnthropic();
  try {
    const res = await anthropic.messages.create({
      model: getModel(),
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: buffer.toString("base64"),
              },
            },
            {
              type: "text",
              text:
                "Transcribe this document so it can be found later by search. " +
                "Capture all visible text verbatim — brand, model, serial/part numbers, " +
                "dates, amounts, specifications, section headings and tables. Preserve the " +
                "reading order. Do not summarize or add commentary; output only the text.",
            },
          ],
        },
      ],
    });
    return res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  } catch (err) {
    console.error("transcribePdfWithClaude failed:", err);
    return "";
  }
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
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}
