// Lazy thumbnail generation for image attachments. Thumbnails are produced on
// first request and cached on disk under UPLOAD_DIR/.thumbs, so existing images
// get thumbnails without any backfill. All failures degrade gracefully (return
// null) so the caller can fall back to streaming the original.
import { resolve, dirname } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { getUploadRoot } from "./storage";

const THUMB_MAX = 480; // longest edge, px

export async function getThumbnail(
  storageKey: string,
  mimeType: string
): Promise<Buffer | null> {
  if (!mimeType.startsWith("image/")) return null;

  const root = getUploadRoot();
  const original = resolve(root, storageKey);
  const thumbPath = resolve(root, ".thumbs", `${storageKey}.webp`);
  // Path-traversal guard: both must stay inside UPLOAD_DIR.
  if (!original.startsWith(root) || !thumbPath.startsWith(root)) return null;

  // Serve the cached thumbnail if we've already made one.
  try {
    return await readFile(thumbPath);
  } catch {
    // not generated yet — fall through and create it
  }

  try {
    // Dynamic import keeps the native dep out of the edge/build graph and lets a
    // missing binary fail softly here rather than at module load.
    const sharp = (await import("sharp")).default;
    const src = await readFile(original);
    const out = await sharp(src)
      .rotate() // honour EXIF orientation
      .resize(THUMB_MAX, THUMB_MAX, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    await mkdir(dirname(thumbPath), { recursive: true });
    await writeFile(thumbPath, out);
    return out;
  } catch (err) {
    console.error("thumbnail generation failed for", storageKey, err);
    return null;
  }
}
