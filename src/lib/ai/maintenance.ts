// AI helpers for the maintenance features: auto-filling item details from a file,
// and proposing service routines from a manual or the web.
import { getAnthropic, getModel, structuredExtract, firstToolInput, type JsonSchema } from "./anthropic";

// Pull the first JSON object/array out of a model response (tolerates ``` fences
// and surrounding prose).
function parseJson<T>(text: string): T | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  const end = Math.max(s.lastIndexOf("}"), s.lastIndexOf("]"));
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function textOf(content: { type: string; text?: string }[]): string {
  return content.map((b) => (b.type === "text" ? b.text ?? "" : "")).join("\n");
}

// Legacy plain free-text completion (no tools). Used as a fallback when the
// structured (forced tool-use) path returns nothing, so extraction keeps working
// even if tool-use is unavailable for the configured model.
async function plainComplete(
  system: string,
  userContent: string,
  maxTokens: number
): Promise<string> {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });
  return textOf(res.content);
}

// ── Auto-fill item details from a document ───────────────────────────────────
export interface AutofillResult {
  description: string;
  fields: Record<string, string>;
}

const AUTOFILL_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description: "A concise 1-3 sentence summary of the item.",
    },
    fields: {
      type: "object",
      description:
        "Key specifications found in the document (brand, model, serial number, year, " +
        "dimensions, power, etc.) as a flat map of string values.",
      additionalProperties: { type: "string" },
    },
  },
  required: ["description", "fields"],
};

const AUTOFILL_SYSTEM =
  "You extract structured details about an item from a document (manual, receipt, " +
  'spec sheet). Return ONLY JSON: {"description": string, "fields": {"<key>": "<value>"}}. ' +
  "description = a concise 1-3 sentence summary of the item. fields = key specs you can " +
  "find (brand, model, serial number, year, dimensions, power, etc.). Use only facts present " +
  "in the document; omit anything you cannot find. Respond with JSON only, no prose.";

export async function autofillFromFile(
  itemContext: string,
  fileText: string
): Promise<AutofillResult> {
  const userContent = `Item so far:\n${itemContext}\n\n--- DOCUMENT ---\n${fileText.slice(0, 20000)}`;
  let parsed = (await structuredExtract({
    toolName: "record_item_details",
    toolDescription:
      "Record the structured details extracted from a document about an item. Use only facts " +
      "present in the document; omit anything you cannot find.",
    schema: AUTOFILL_SCHEMA,
    maxTokens: 1024,
    userContent,
  })) as AutofillResult | null;
  // Fallback to the legacy free-text method if forced tool-use yielded nothing.
  if (!parsed) {
    parsed = parseJson<AutofillResult>(await plainComplete(AUTOFILL_SYSTEM, userContent, 1024));
  }
  return {
    description: typeof parsed?.description === "string" ? parsed.description : "",
    fields:
      parsed?.fields && typeof parsed.fields === "object" && !Array.isArray(parsed.fields)
        ? Object.fromEntries(
            Object.entries(parsed.fields)
              .filter(([k, v]) => k && typeof v === "string")
              .map(([k, v]) => [String(k).slice(0, 80), String(v).slice(0, 500)])
          )
        : {},
  };
}

// ── Suggest maintenance routines ──────────────────────────────────────────────
export interface RoutineSuggestion {
  title: string;
  description: string;
  recurrenceMonths: number | null;
  recurrenceNote: string | null;
}
export interface RoutinesResult {
  routines: RoutineSuggestion[];
  citations: { url: string; title: string }[];
}

const ROUTINES_SYSTEM =
  "You produce a recommended maintenance schedule for the item. " +
  "recurrenceMonths = interval in months if time-based (e.g. 6, 12, 24). recurrenceNote = a " +
  'non-time interval such as "every 10 000 km" or "every 250 operating hours", else null. ' +
  "Give 3-10 concrete, item-specific routines.";

const ROUTINES_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    routines: {
      type: "array",
      description: "The recommended maintenance routines.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short routine name." },
          description: { type: "string", description: "What the routine involves." },
          recurrenceMonths: {
            type: ["integer", "null"],
            description: "Interval in months if time-based, else null.",
          },
          recurrenceNote: {
            type: ["string", "null"],
            description: 'Non-time interval (e.g. "every 10 000 km"), else null.',
          },
        },
        required: ["title"],
      },
    },
  },
  required: ["routines"],
};

function normalizeRoutines(routines: unknown): RoutineSuggestion[] {
  if (!Array.isArray(routines)) return [];
  return routines
    .filter(
      (r): r is RoutineSuggestion =>
        !!r && typeof (r as RoutineSuggestion).title === "string" &&
        (r as RoutineSuggestion).title.trim().length > 0
    )
    .slice(0, 12)
    .map((r) => ({
      title: String(r.title).slice(0, 200),
      description: typeof r.description === "string" ? r.description.slice(0, 1000) : "",
      recurrenceMonths:
        typeof r.recurrenceMonths === "number" && r.recurrenceMonths > 0
          ? Math.round(r.recurrenceMonths)
          : null,
      recurrenceNote:
        typeof r.recurrenceNote === "string" && r.recurrenceNote.trim()
          ? r.recurrenceNote.trim()
          : null,
    }));
}

const ROUTINES_SYSTEM_JSON =
  ROUTINES_SYSTEM +
  ' Return ONLY JSON: {"routines":[{"title":string,"description":string,' +
  '"recurrenceMonths":number|null,"recurrenceNote":string|null}]}. Respond with JSON only, no prose.';

export async function suggestRoutinesFromText(
  itemContext: string,
  manualText: string
): Promise<RoutinesResult> {
  const userContent = `Item:\n${itemContext}\n\n--- SERVICE MANUAL ---\n${manualText.slice(0, 24000)}`;
  let parsed = (await structuredExtract({
    toolName: "record_routines",
    toolDescription: "Record the recommended maintenance routines for the item.",
    schema: ROUTINES_SCHEMA,
    system: ROUTINES_SYSTEM,
    maxTokens: 1500,
    userContent,
  })) as { routines: unknown } | null;
  if (!parsed) {
    parsed = parseJson<{ routines: unknown }>(
      await plainComplete(ROUTINES_SYSTEM_JSON, userContent, 1500)
    );
  }
  return { routines: normalizeRoutines(parsed?.routines), citations: [] };
}

export async function suggestRoutinesFromWeb(itemContext: string): Promise<RoutinesResult> {
  if (process.env.ENABLE_WEB_SEARCH === "false") {
    throw new Error("Web search is disabled (ENABLE_WEB_SEARCH=false).");
  }
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 1800,
    // web_search runs first (can't be forced), then the model records its answer
    // via the record_routines tool. tool_choice stays auto so search can happen.
    tools: [
      { type: "web_search_20250305", name: "web_search", max_uses: 5 },
      {
        name: "record_routines",
        description: "Record the recommended maintenance routines once you have researched them.",
        input_schema: ROUTINES_SCHEMA,
      },
    ] as never,
    system:
      ROUTINES_SYSTEM +
      " First, use web search to find the manufacturer's recommended maintenance intervals for " +
      "this exact item, then call record_routines with the result.",
    messages: [
      {
        role: "user",
        content: `Item:\n${itemContext}\n\nFind and return the recommended maintenance routines.`,
      },
    ],
  });

  const citations: { url: string; title: string }[] = [];
  for (const block of res.content as { type: string; citations?: { url?: string; title?: string }[] }[]) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.url && !citations.find((x) => x.url === c.url)) {
          citations.push({ url: c.url, title: c.title ?? c.url });
        }
      }
    }
  }
  // Prefer the structured tool call; fall back to parsing prose JSON if the model
  // answered in text instead of calling record_routines.
  const fromTool = firstToolInput(res.content, "record_routines") as { routines: unknown } | null;
  const parsed = fromTool ?? parseJson<{ routines: unknown }>(textOf(res.content));
  return { routines: normalizeRoutines(parsed?.routines), citations };
}
