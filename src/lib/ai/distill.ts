// Distill an item's raw material (its fields, notes, attachment text, web finds)
// into a "living" front page: a one-line at-a-glance, a rich markdown summary, an
// inferred layout archetype, and which fields deserve hero billing. Uses the
// forced-tool-use structured helper so the result is schema-shaped.
import { structuredExtract, hasAnthropic, type JsonSchema } from "./anthropic";

export const LAYOUTS = [
  "property",
  "vehicle",
  "travel",
  "tech",
  "vessel",
  "document",
  "generic",
] as const;
export type Layout = (typeof LAYOUTS)[number];

export const FIELD_TYPES = ["text", "number", "date", "url", "money"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface DistillInput {
  title: string;
  category: string | null;
  description: string | null;
  location: string | null;
  tags: string[];
  fields: Record<string, string>;
  notes: string[];
  documents: { fileName: string; text: string }[];
}

export interface DistillResult {
  atAGlance: string;
  markdown: string;
  layout: Layout;
  heroFields: string[];
  fieldTypes: Record<string, FieldType>;
}

const SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    atAGlance: {
      type: "string",
      description: "A single punchy sentence (max ~140 chars) summarising the item at a glance.",
    },
    markdown: {
      type: "string",
      description:
        "A rich GitHub-flavoured Markdown summary of everything important about this item — " +
        "key facts, specs worth highlighting, status, history, and anything notable from the " +
        "notes/documents. Use headings, short paragraphs, bullet lists and tables where helpful. " +
        "Do NOT invent facts; only use what is provided. No raw HTML.",
    },
    layout: {
      type: "string",
      enum: [...LAYOUTS],
      description:
        "The archetype that best fits this item's nature, for adaptive presentation: " +
        "property (house/cabin/real estate), vehicle (car/MC/bike), travel (a trip/plan), " +
        "tech (computer/network/electronics), vessel (boat), document (a paper/contract), " +
        "or generic.",
    },
    heroFields: {
      type: "array",
      items: { type: "string" },
      description:
        "Up to 4 field keys (verbatim from the provided fields) most worth showing prominently " +
        "as headline stats. Empty if none stand out.",
    },
    fieldTypes: {
      type: "object",
      additionalProperties: { type: "string", enum: [...FIELD_TYPES] },
      description:
        "Optional type hint per field key, to drive formatting: text, number, date, url or money.",
    },
  },
  required: ["atAGlance", "markdown", "layout"],
};

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

export async function distillItem(input: DistillInput): Promise<DistillResult | null> {
  if (!hasAnthropic()) return null;

  const fieldLines = Object.entries(input.fields ?? {})
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const noteLines = input.notes.map((n, i) => `Note ${i + 1}: ${clip(n, 1500)}`).join("\n\n");
  const docLines = input.documents
    .map((d) => `### ${d.fileName}\n${clip(d.text, 4000)}`)
    .join("\n\n");

  const userContent = [
    `TITLE: ${input.title}`,
    input.category ? `CATEGORY: ${input.category}` : "",
    input.location ? `LOCATION: ${input.location}` : "",
    input.tags.length ? `TAGS: ${input.tags.join(", ")}` : "",
    input.description ? `DESCRIPTION:\n${input.description}` : "",
    fieldLines ? `FIELDS:\n${fieldLines}` : "",
    noteLines ? `NOTES:\n${noteLines}` : "",
    docLines ? `ATTACHED DOCUMENTS / FINDINGS:\n${docLines}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = (await structuredExtract({
    toolName: "render_item_page",
    toolDescription:
      "Render the living front-page summary for an item from everything known about it.",
    schema: SCHEMA,
    system:
      "You are building a personal knowledge base. Distil an item into a glanceable, accurate " +
      "front page. Be concise and concrete; never fabricate specifications, serial numbers, " +
      "dates or facts that are not present in the input.",
    maxTokens: 2048,
    userContent: clip(userContent, 30000),
  })) as Partial<DistillResult> | null;

  if (!result || typeof result.markdown !== "string" || typeof result.atAGlance !== "string") {
    return null;
  }

  const layout: Layout =
    typeof result.layout === "string" && (LAYOUTS as readonly string[]).includes(result.layout)
      ? (result.layout as Layout)
      : "generic";

  const heroFields = Array.isArray(result.heroFields)
    ? result.heroFields.filter((k): k is string => typeof k === "string").slice(0, 4)
    : [];

  const fieldTypes: Record<string, FieldType> = {};
  if (result.fieldTypes && typeof result.fieldTypes === "object") {
    for (const [k, v] of Object.entries(result.fieldTypes)) {
      if (typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v)) {
        fieldTypes[k] = v as FieldType;
      }
    }
  }

  return {
    atAGlance: clip(result.atAGlance, 400),
    markdown: clip(result.markdown, 12000),
    layout,
    heroFields,
    fieldTypes,
  };
}

// Fold a DistillResult's heroFields + fieldTypes into the items.fieldsMeta shape,
// scoped to the field keys the item actually has.
export function buildFieldsMeta(
  fields: Record<string, string>,
  heroFields: string[],
  fieldTypes: Record<string, FieldType>
): Record<string, { hero?: boolean; type?: string }> {
  const meta: Record<string, { hero?: boolean; type?: string }> = {};
  for (const key of Object.keys(fields ?? {})) {
    const entry: { hero?: boolean; type?: string } = {};
    if (heroFields.includes(key)) entry.hero = true;
    if (fieldTypes[key]) entry.type = fieldTypes[key];
    if (entry.hero || entry.type) meta[key] = entry;
  }
  return meta;
}
