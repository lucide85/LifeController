// AI write-back: extract durable, structured facts about an item from some source
// text (a chat answer, a web finding, a document) and propose them as spec-field
// changes. The proposal is read-only — applying is a separate, explicit step that
// records provenance. Confidence policy keeps humans in the loop for anything that
// would overwrite an existing value.
import { structuredExtract, hasAnthropic, type JsonSchema } from "./anthropic";

export type WriteSource = "chat" | "web" | "manual" | "ai" | "upload";

// op status:
//  - "auto":     additive (field is empty) AND high confidence → safe to pre-select.
//  - "review":   additive but lower confidence → needs a look.
//  - "conflict": would change an existing non-empty value → always needs confirmation.
//  - "noop":     value unchanged.
export type OpStatus = "auto" | "review" | "conflict" | "noop";

export interface ProposedOp {
  key: string;
  newValue: string;
  oldValue: string | null;
  confidence: number;
  status: OpStatus;
}

const AUTO_CONFIDENCE = 0.8;

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    facts: {
      type: "array",
      description:
        "Durable, concrete spec facts about the item supported by the source text. Each is a " +
        "field key/value pair (e.g. 'Oil capacity' / '3.8 L', 'VIN' / '...'). Omit vague, " +
        "temporary or unsupported information.",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "Short field name." },
          value: { type: "string", description: "The value as a short string." },
          confidence: {
            type: "number",
            description: "0..1 confidence the fact is correct and supported by the source.",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["facts"],
};

function classify(oldValue: string | null, newValue: string, confidence: number): OpStatus {
  const has = oldValue != null && oldValue.trim() !== "";
  if (has && oldValue.trim() === newValue.trim()) return "noop";
  if (has) return "conflict";
  return confidence >= AUTO_CONFIDENCE ? "auto" : "review";
}

export async function proposeFieldChanges(input: {
  itemContext: string;
  currentFields: Record<string, string>;
  sourceText: string;
}): Promise<ProposedOp[]> {
  if (!hasAnthropic()) return [];

  const knownKeys = Object.keys(input.currentFields ?? {});
  const result = (await structuredExtract({
    toolName: "record_facts",
    toolDescription:
      "Record durable spec facts extracted from the source text about this item.",
    schema: SCHEMA,
    system:
      "You extract durable, factual specifications about an item from source text (a chat " +
      "answer, web finding or document). Only include facts clearly supported by the source. " +
      "Reuse these existing field keys verbatim when applicable: " +
      (knownKeys.length ? knownKeys.join(", ") : "(none yet)") +
      ". Never invent values.",
    maxTokens: 1024,
    userContent: `Item:\n${input.itemContext}\n\n--- SOURCE TEXT ---\n${input.sourceText.slice(
      0,
      16000
    )}`,
  })) as { facts?: unknown } | null;

  const facts = Array.isArray(result?.facts) ? result!.facts : [];
  const ops: ProposedOp[] = [];
  for (const f of facts as Array<{ key?: unknown; value?: unknown; confidence?: unknown }>) {
    if (typeof f?.key !== "string" || typeof f?.value !== "string") continue;
    const key = f.key.trim().slice(0, 80);
    const newValue = f.value.trim().slice(0, 500);
    if (!key || !newValue) continue;
    const oldValue = input.currentFields[key] ?? null;
    const confidence =
      typeof f.confidence === "number" && f.confidence >= 0 && f.confidence <= 1
        ? f.confidence
        : 0.6;
    const status = classify(oldValue, newValue, confidence);
    if (status === "noop") continue;
    ops.push({ key, newValue, oldValue, confidence, status });
  }
  return ops;
}
