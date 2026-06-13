// Embeddings via Voyage AI (Anthropic's recommended embeddings partner).
// If VOYAGE_API_KEY is absent, embedding() returns null and the app degrades
// gracefully to keyword-only search.
import { EMBEDDING_DIM } from "@/lib/db/schema";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

export function embeddingsEnabled(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}

type InputType = "document" | "query";

export async function embed(
  text: string,
  inputType: InputType = "document"
): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key || !text?.trim()) return null;

  const model = process.env.VOYAGE_EMBED_MODEL ?? "voyage-3-large";

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      input: [text.slice(0, 32000)],
      model,
      input_type: inputType,
      output_dimension: EMBEDDING_DIM,
    }),
  });

  if (!res.ok) {
    console.error("Voyage embedding failed:", res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data?.[0]?.embedding ?? null;
}

// Build the canonical text we embed for an item.
export function itemEmbedText(item: {
  title: string;
  category?: string | null;
  description?: string | null;
  fields?: Record<string, string> | null;
  tags?: string[] | null;
  location?: string | null;
}): string {
  const parts = [
    item.title,
    item.category ? `Category: ${item.category}` : "",
    item.location ? `Location: ${item.location}` : "",
    item.description ?? "",
    item.tags?.length ? `Tags: ${item.tags.join(", ")}` : "",
    item.fields
      ? Object.entries(item.fields)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n")
      : "",
  ];
  return parts.filter(Boolean).join("\n");
}
