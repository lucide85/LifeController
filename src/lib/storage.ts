// Local-disk file storage. Files are written under UPLOAD_DIR, namespaced by item.
import { mkdir, writeFile, readFile, unlink } from "fs/promises";
import { createReadStream } from "fs";
import { join, resolve, extname } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads");

export function getUploadRoot() {
  return UPLOAD_DIR;
}

// Sanitize and build a storage key. Returns a path relative to UPLOAD_DIR.
function buildKey(itemId: string, originalName: string) {
  const ext = extname(originalName).slice(0, 16);
  return join(itemId, `${randomUUID()}${ext}`);
}

export async function saveBuffer(
  itemId: string,
  originalName: string,
  data: Buffer
): Promise<{ storageKey: string; sizeBytes: number }> {
  const key = buildKey(itemId, originalName);
  const fullPath = join(UPLOAD_DIR, key);
  await mkdir(join(UPLOAD_DIR, itemId), { recursive: true });
  await writeFile(fullPath, data);
  return { storageKey: key, sizeBytes: data.byteLength };
}

export async function readStored(storageKey: string): Promise<Buffer> {
  // Guard against path traversal: resolved path must stay inside UPLOAD_DIR.
  const full = resolve(UPLOAD_DIR, storageKey);
  if (!full.startsWith(UPLOAD_DIR)) throw new Error("Invalid storage key");
  return readFile(full);
}

export function streamStored(storageKey: string) {
  const full = resolve(UPLOAD_DIR, storageKey);
  if (!full.startsWith(UPLOAD_DIR)) throw new Error("Invalid storage key");
  return createReadStream(full);
}

export async function deleteStored(storageKey: string): Promise<void> {
  const full = resolve(UPLOAD_DIR, storageKey);
  if (!full.startsWith(UPLOAD_DIR)) throw new Error("Invalid storage key");
  await unlink(full).catch(() => {});
}
