// AI triage for the capture inbox: given a dropped thing's text + candidate items
// it might belong to, decide whether to ATTACH it to an existing item or CREATE a
// new one, and propose a title/category/tags/fields. Human-confirmed before it
// takes effect (the proposal is just a suggestion).
import { structuredExtract, hasAnthropic, type JsonSchema } from "./anthropic";

export interface CaptureCandidate {
  id: string;
  title: string;
  category: string;
  score: number;
}

export interface CaptureSuggestion {
  action: "attach" | "create";
  targetItemId: string | null;
  title: string | null;
  category: string | null;
  summary: string | null;
  tags: string[];
  fields: Record<string, string>;
  confidence: number;
  candidates: CaptureCandidate[];
}

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["attach", "create"],
      description:
        "attach = this clearly belongs to one of the candidate items; create = it's a new thing.",
    },
    targetItemId: {
      type: ["string", "null"],
      description: "When action=attach, the id of the candidate item it belongs to.",
    },
    title: { type: "string", description: "When action=create, a concise item title." },
    category: {
      type: "string",
      description: "When action=create, the best category (reuse an existing one if it fits).",
    },
    summary: { type: "string", description: "One or two sentences describing what this is." },
    tags: { type: "array", items: { type: "string" } },
    fields: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Any structured spec facts present in the content (key/value).",
    },
    confidence: { type: "number", description: "0..1 confidence in the action chosen." },
  },
  required: ["action"],
};

export async function classifyAndRoute(input: {
  text: string;
  kind: "text" | "url" | "file";
  sourceTitle?: string | null;
  candidates: CaptureCandidate[];
  categories: string[];
}): Promise<CaptureSuggestion | null> {
  if (!hasAnthropic()) return null;

  const candidateList = input.candidates.length
    ? input.candidates
        .map((c) => `- id=${c.id} | "${c.title}" (${c.category}, similarity ${c.score.toFixed(2)})`)
        .join("\n")
    : "(none yet — the library is empty or nothing is similar)";

  const userContent = [
    `KIND: ${input.kind}`,
    input.sourceTitle ? `SOURCE TITLE: ${input.sourceTitle}` : "",
    `EXISTING CATEGORIES: ${input.categories.join(", ") || "(none)"}`,
    `CANDIDATE ITEMS:\n${candidateList}`,
    `--- DROPPED CONTENT ---\n${input.text.slice(0, 12000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = (await structuredExtract({
    toolName: "route_capture",
    toolDescription: "Decide how to file a dropped item and propose its details.",
    schema: SCHEMA,
    system:
      "You triage things dropped into a personal library. Attach to a candidate ONLY when the " +
      "content is clearly about that same real-world item; otherwise create a new item. Reuse an " +
      "existing category when one fits. Never invent specifications. Be concise.",
    maxTokens: 1024,
    userContent,
  })) as Partial<CaptureSuggestion> | null;

  if (!result || (result.action !== "attach" && result.action !== "create")) return null;

  const tags = Array.isArray(result.tags)
    ? result.tags.filter((t): t is string => typeof t === "string").slice(0, 12)
    : [];
  const fields: Record<string, string> = {};
  if (result.fields && typeof result.fields === "object") {
    for (const [k, v] of Object.entries(result.fields)) {
      if (typeof v === "string") fields[String(k).slice(0, 80)] = String(v).slice(0, 500);
    }
  }

  // Only honour a targetItemId that is actually one of the candidates we offered.
  let targetItemId: string | null = null;
  if (result.action === "attach") {
    const valid =
      typeof result.targetItemId === "string" &&
      input.candidates.some((c) => c.id === result.targetItemId);
    targetItemId = valid ? (result.targetItemId as string) : input.candidates[0]?.id ?? null;
  }

  return {
    action: targetItemId === null && result.action === "attach" ? "create" : result.action,
    targetItemId,
    title: typeof result.title === "string" ? result.title.slice(0, 200) : null,
    category: typeof result.category === "string" ? result.category.slice(0, 80) : null,
    summary: typeof result.summary === "string" ? result.summary.slice(0, 600) : null,
    tags,
    fields,
    confidence:
      typeof result.confidence === "number" && result.confidence >= 0 && result.confidence <= 1
        ? result.confidence
        : 0.6,
    candidates: input.candidates,
  };
}
