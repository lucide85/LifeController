// The search agent. answerFromLibrary() answers using only the user's stored
// library. searchWeb() is the fallback that looks documentation up online using
// what we know about the item, and returns findings + sources so they can be
// stored back into the library.
import { getAnthropic, getModel } from "./anthropic";
import { retrieve, retrieveForItem, type RetrievedChunk } from "./search";

export interface AgentAnswer {
  answer: string;
  found: boolean;
  sources: RetrievedChunk[];
  // Suggested web query the UI can offer to run if nothing was found.
  suggestedWebQuery?: string;
}

export async function answerFromLibrary(
  userId: string,
  question: string
): Promise<AgentAnswer> {
  const chunks = await retrieve(userId, question, 10);

  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] (${c.kind} — item "${c.itemTitle}", relevance ${c.score.toFixed(
          2
        )})\n${c.text}`
    )
    .join("\n\n");

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system:
      "You are the user's personal librarian. Answer the question using ONLY the " +
      "library context provided. Cite the bracketed source numbers you used, e.g. [2]. " +
      "If the context does not contain the answer, reply with EXACTLY the token " +
      "NOT_FOUND on its own line, optionally followed by a short note on what " +
      "additional info would help. Never invent specifications, serial numbers, or facts.",
    messages: [
      {
        role: "user",
        content: `Question: ${question}\n\n--- LIBRARY CONTEXT ---\n${
          context || "(the library returned no matching entries)"
        }`,
      },
    ],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  const found = !/^\s*NOT_FOUND/m.test(text);

  return {
    answer: found ? text : text.replace(/^\s*NOT_FOUND\s*/m, "").trim(),
    found,
    sources: chunks.filter((c) => c.score > 0.3),
    suggestedWebQuery: found ? undefined : question,
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ItemChatAnswer {
  answer: string;
  found: boolean;
  sources: RetrievedChunk[];
}

// Multi-turn chat grounded ONLY in one item's own data (its fields, description,
// attachments and notes). Prior turns are passed for continuity; retrieval re-runs
// against the latest message each turn so context stays focused.
export async function answerAboutItem(
  userId: string,
  itemId: string,
  message: string,
  history: ChatTurn[] = []
): Promise<ItemChatAnswer> {
  const chunks = await retrieveForItem(userId, itemId, message, 10);

  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.kind})\n${c.text}`)
    .join("\n\n");

  // Keep the last few turns only, to bound context.
  const recent = history.slice(-8).map((t) => ({
    role: t.role,
    content: t.content.slice(0, 4000),
  }));

  const anthropic = getAnthropic();
  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 1024,
    system:
      "You are the owner's assistant for ONE specific item in their library. Answer using " +
      "ONLY the item context provided (its specs, description, attached documents and notes). " +
      "Cite the bracketed source numbers you used, e.g. [2]. If the context does not contain " +
      "the answer, reply with EXACTLY the token NOT_FOUND on its own line, optionally followed " +
      "by a short note. Never invent specifications, serial numbers, dates or facts.",
    messages: [
      ...recent,
      {
        role: "user",
        content: `${message}\n\n--- ITEM CONTEXT ---\n${
          context || "(no stored context for this item yet)"
        }`,
      },
    ],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  const found = !/^\s*NOT_FOUND/m.test(text);
  return {
    answer: found ? text : text.replace(/^\s*NOT_FOUND\s*/m, "").trim(),
    found,
    sources: chunks.filter((c) => c.kind !== "item" && c.score > 0.3),
  };
}

export interface WebFinding {
  answer: string;
  citations: { url: string; title: string }[];
  // A self-contained document we can store as a web-sourced attachment.
  documentText: string;
  documentTitle: string;
}

// Uses Claude's built-in web_search tool. `itemContext` is everything we know
// about the item (title, category, fields) so the search is grounded.
export async function searchWeb(
  question: string,
  itemContext: string
): Promise<WebFinding> {
  if (process.env.ENABLE_WEB_SEARCH === "false") {
    throw new Error("Web search is disabled (ENABLE_WEB_SEARCH=false).");
  }
  const anthropic = getAnthropic();

  const res = await anthropic.messages.create({
    model: getModel(),
    max_tokens: 2048,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      } as any,
    ],
    system:
      "You research documentation, manuals, specifications and official information " +
      "for a specific item the user owns. Use web search to find authoritative sources " +
      "(manufacturer manuals, spec sheets, official docs). Then write a concise, " +
      "well-structured document capturing the answer and key facts, and ALWAYS list the " +
      "source URLs you used. Prefer primary/official sources.",
    messages: [
      {
        role: "user",
        content:
          `I need documentation/information about this item:\n${itemContext}\n\n` +
          `Question: ${question}\n\n` +
          `Search the web, then write a clean reference document I can save.`,
      },
    ],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  // Collect citations from text blocks (Claude attaches citation metadata).
  const citations: { url: string; title: string }[] = [];
  for (const block of res.content as any[]) {
    if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.url && !citations.find((x) => x.url === c.url)) {
          citations.push({ url: c.url, title: c.title ?? c.url });
        }
      }
    }
  }

  return {
    answer: text,
    citations,
    documentText:
      text +
      (citations.length
        ? `\n\n---\nSources:\n${citations.map((c) => `- ${c.title}: ${c.url}`).join("\n")}`
        : ""),
    documentTitle: `Web research: ${question}`.slice(0, 120),
  };
}
