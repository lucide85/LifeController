# CLAUDE.md

Guidance for AI coding agents (and humans) working in this repo.

## What this is

**LifeController** — a personal "single source of truth" web app. Store any
**item** (house, bike, MC, computer, network, cabin, boat, travel plan… anything),
attach files/receipts/images, record free-form spec fields + notes, and ask an AI
agent to find anything. When something isn't in the library, the agent searches
the web using the item's own details and saves the documentation back, citing the
source URL.

## Stack

- **Next.js 15** (App Router, TypeScript) · **Tailwind** + **shadcn/ui** (new-york, zinc)
- **PostgreSQL + pgvector** via **Drizzle ORM** (`postgres-js` driver)
- **Auth.js v5** (`next-auth@5` beta) — Google login, admin-gated approval
- **Anthropic Claude** (`claude-opus-4-8`) for answers + `web_search` fallback
- **Voyage AI** (`voyage-3-large`, 1024-dim) for embeddings
- **Local-disk** file storage under `UPLOAD_DIR`

## Commands

```bash
npm install
npm run db:migrate     # enable pgvector + create schema (run once, needs DATABASE_URL)
npm run dev            # http://localhost:3000
npm run build          # production build (output: standalone)
npm run db:push        # push schema changes directly (dev)
npm run db:generate    # generate a versioned migration after editing schema.ts
npm run db:studio      # Drizzle Studio
docker compose up -d db # Postgres + pgvector only
```

> There is **no test suite yet**. Verify changes by running `npm run build` and
> exercising the app manually. See `SETUP.md` for full setup incl. Google OAuth.

## Architecture map

- `src/app/` — App Router pages + `api/` route handlers (Node runtime).
  - `api/items`, `api/items/[id]`, `.../attachments`, `.../notes` — CRUD + upload.
    Upload accepts an optional `taskId` form field to attach a file to a maintenance task.
  - `api/items/[id]/tasks` (create) + `api/tasks/[id]` (PATCH/DELETE) — maintenance log.
    Completing a recurring task auto-creates the next planned occurrence.
  - `api/items/[id]/autofill` — Claude proposes description+fields from a file (review/apply client-side).
  - `api/items/[id]/routines` — Claude proposes service routines from a manual or the web.
  - `api/files/[id]` — streams an upload to its owner only (inline; `?download=1` to download).
  - `api/search` — ask the library (Claude grounded in retrieval).
  - `api/search/web` — web-search fallback; stores findings as `source: "web"` attachments.
  - `api/admin/*` — user approval/roles; `redeem-code` is the break-glass admin path.
  - `api/auth/[...nextauth]` — Auth.js handlers.
- `src/lib/db/` — Drizzle `schema.ts`, client `index.ts`, `migrate.ts` runner.
- `src/lib/ai/` — `anthropic.ts` (client), `embeddings.ts` (Voyage), `extract.ts`
  (PDF parse + image transcription), `search.ts` (pgvector retrieval), `agent.ts`
  (`answerFromLibrary`, `searchWeb`), `maintenance.ts` (`autofillFromFile`,
  `suggestRoutinesFromText/Web` — return parsed JSON, applied/created client-side).
- **Maintenance module**: `maintenance_tasks` table (planned/done, dueDate=reminder,
  recurrence). `attachments.taskId` links files/photos to a task (gallery). UI in
  `maintenance-section.tsx`; reminders on the dashboard via `reminders-widget.tsx`;
  file preview in `file-preview.tsx`; auto-fill in `autofill-dialog.tsx`.
- `src/lib/auth.ts` (Node) + `src/auth.config.ts` (edge-safe) — split Auth.js config.
- `src/lib/auth-guard.ts` — `requireApprovedUser` / `requireAdmin` / `getApprovedUserOrNull`.
- `src/lib/settings.ts` — reads `settings.json` (admin secure code), env fallback.
- `src/lib/storage.ts` — local-disk read/write with path-traversal guards.
- `src/components/ui/` — shadcn primitives. `src/components/*` — feature components.

## Conventions & gotchas

- **Edge vs Node split is load-bearing.** `src/middleware.ts` and `src/auth.config.ts`
  must NOT import anything Node-only (no `fs`, `postgres`, `db`, `settings.ts`).
  All DB/approval logic lives in Node route handlers / server components via
  `auth-guard.ts`. Don't move DB calls into `auth.config.ts` or middleware.
- **Approval gating reads the DB fresh** (`auth-guard.ts`), not the JWT — so an
  admin approving a user takes effect immediately. The JWT only carries `uid`.
- **Next 15 dynamic params are Promises:** `{ params }: { params: Promise<{ id: string }> }`
  then `await params`. Keep this in all dynamic routes/pages.
- **Embeddings are best-effort.** Every embed call returns `null` if `VOYAGE_API_KEY`
  is absent; search falls back to keyword (ILIKE). Never let a failed embed block a write.
- **AI is optional.** No `ANTHROPIC_API_KEY` → `/api/search` returns raw retrieval
  results and web search is disabled. Guard with `hasAnthropic()`.
- **pgvector similarity** uses the `<=>` cosine operator via the `SIM()` helper in
  `search.ts`; reuse the same `sql` expression in `.select()` and `.orderBy(desc(...))`.
- **pdf-parse** must be imported from `pdf-parse/lib/pdf-parse.js` (its index.js has
  a debug branch that crashes under bundlers).
- **Secrets**: `.env` and `settings.json` are gitignored — never commit them.
  `ADMIN_EMAIL` (default `avikane@gmail.com`) is auto-approved as admin on first login.
- Embedding dimension is fixed at **1024** (`EMBEDDING_DIM` in `schema.ts`). Changing
  the embed model means changing this AND re-migrating the vector columns.

## When adding a feature touching items

Embed on write (title+desc+fields for items, filename+extracted text for
attachments, body for notes) so semantic search keeps working, and scope every
query by `ownerId` — users only ever see their own library.
