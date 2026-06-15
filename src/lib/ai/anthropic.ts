import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

export function hasAnthropic(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ── Structured extraction ──────────────────────────────────────────────────────
// Get schema-shaped JSON out of Claude reliably by forcing a single tool call,
// instead of parsing JSON out of free-text prose (the old, brittle approach).
// Returns the tool input (caller should still validate/normalize), or null if the
// model refused / hit a stop reason without calling the tool.
export type JsonSchema = Record<string, unknown>;

// Pull the input of the first `tool_use` block with the given name out of a
// message's content array.
export function firstToolInput(content: unknown[], name: string): unknown | null {
  for (const block of content as { type?: string; name?: string; input?: unknown }[]) {
    if (block?.type === "tool_use" && block.name === name) return block.input ?? null;
  }
  return null;
}

export async function structuredExtract(params: {
  toolName: string;
  toolDescription: string;
  schema: JsonSchema;
  userContent: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<unknown | null> {
  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: params.maxTokens ?? 1024,
    temperature: params.temperature ?? 0.2,
    ...(params.system ? { system: params.system } : {}),
    // Cast: the schema is a plain JSON Schema; the SDK's strict tool typing is
    // narrower than what the API accepts (same pattern as the web_search tool).
    tools: [
      {
        name: params.toolName,
        description: params.toolDescription,
        input_schema: params.schema,
      },
    ] as never,
    // Force the model to answer by calling our tool, so the result is structured.
    tool_choice: { type: "tool", name: params.toolName } as never,
    messages: [{ role: "user", content: params.userContent }],
  });
  return firstToolInput(res.content, params.toolName);
}
