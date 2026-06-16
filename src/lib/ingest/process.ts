// Item-agnostic upload processing: save bytes to disk, extract searchable text,
// and embed it. Decoupled from items so both the per-item attachments route and
// the capture inbox can share it. All extraction/embedding is best-effort.
import { saveBuffer } from "@/lib/storage";
import { extractText } from "@/lib/ai/extract";
import { embed } from "@/lib/ai/embeddings";

export interface ProcessedUpload {
  storageKey: string;
  sizeBytes: number;
  extractedText: string;
  embedding: number[] | null;
}

export async function processUpload(opts: {
  prefix: string; // storage namespace (an itemId, or "_inbox" for unfiled captures)
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ProcessedUpload> {
  const { storageKey, sizeBytes } = await saveBuffer(opts.prefix, opts.fileName, opts.buffer);

  let extractedText = "";
  let embedding: number[] | null = null;
  try {
    extractedText = await extractText(opts.buffer, opts.mimeType, opts.fileName);
    if (extractedText) embedding = await embed(`${opts.fileName}\n${extractedText}`);
  } catch (err) {
    console.error("processUpload extract/embed failed for", opts.fileName, err);
  }

  return { storageKey, sizeBytes, extractedText, embedding };
}
