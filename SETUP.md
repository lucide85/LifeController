# LifeController — Setup & Run Guide

Your personal single-source-of-truth library. Store anything you care about
(house, bike, MC, computer, network, cabin, boat, travel plans…), attach files,
receipts and images, and ask an AI agent to find anything. If it's not in your
library, the agent can search the web using what it knows about the item and save
the documentation back, with a link to where it was found.

**Stack:** Next.js (App Router) · PostgreSQL + pgvector · Drizzle ORM ·
Auth.js (Google) · Claude (answers + embeddings + web search) · local-disk files ·
shadcn/ui.

---

## 0. Prerequisites

Install on the machine/VPS:

- **Node.js 20+** and npm — https://nodejs.org
- **Docker** + Docker Compose (for PostgreSQL, and optionally the app) —
  https://docs.docker.com/get-docker/

> This project was scaffolded on a machine without Node/Docker installed. Install
> both before the steps below.

---

## 1. Configure secrets

```bash
cp .env.example .env
cp settings.example.json settings.json
```

Edit **`.env`** and fill in:

| Variable | What | Required for |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection string (default matches docker-compose) | always |
| `AUTH_SECRET` | run `openssl rand -base64 32` | always |
| `AUTH_URL` / `NEXTAUTH_URL` | `http://localhost:3000` (dev) or `https://your-domain` (prod) | always |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (see §2) | Google login |
| `ADMIN_EMAIL` | `avikane@gmail.com` — auto-approved as admin on first login | admin |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys | AI answers + web search |
| `VOYAGE_API_KEY` | https://www.voyageai.com — embeddings for semantic search | semantic search |

Edit **`settings.json`** and set a strong `adminSecureCode`
(`openssl rand -hex 32`). This is the **break-glass** admin code: any logged-in
user who enters it on the *Pending* screen becomes an approved admin. Keep this
file on the server only — it's gitignored.

> **Graceful degradation:** no `ANTHROPIC_API_KEY` → AI answers/web-search are
> disabled but keyword search still works. No `VOYAGE_API_KEY` → semantic search
> falls back to keyword matching. Everything else works regardless.

---

## 2. Google OAuth (login)

1. Go to https://console.cloud.google.com/apis/credentials
2. **Create credentials → OAuth client ID → Web application.**
3. Authorized redirect URIs:
   - Dev: `http://localhost:3000/api/auth/callback/google`
   - Prod: `https://your-domain.example/api/auth/callback/google`
4. Copy the Client ID/Secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

---

## 3a. Run locally (dev)

```bash
# Start only the database in Docker:
docker compose up -d db

# Install deps:
npm install

# Create the pgvector extension, tables and indexes:
npm run db:migrate

# Start the dev server:
npm run dev
```

Open http://localhost:3000.

## 3b. Run the whole thing in Docker (prod / VPS)

```bash
# 1. Start the database (auto-enables pgvector on first boot):
docker compose up -d db

# 2. Apply the schema from the host (the db port 5432 is published).
#    Make sure DATABASE_URL in .env points at localhost:5432.
npm install
npm run db:migrate

# 3. Build & start the app container:
docker compose up -d --build app
```

The app listens on port **3000**. Put a reverse proxy (Caddy / Nginx / Traefik)
in front of it for TLS on `your-domain.example`, and set `AUTH_URL` accordingly.
Uploaded files persist in the `lc_uploads` Docker volume; the DB in `lc_pgdata`.

> Schema management: `npm run db:migrate` applies the bundled migration in
> `drizzle/`. To evolve the schema later, edit `src/lib/db/schema.ts` then run
> `npm run db:push` (quick, direct) or `npm run db:generate && npm run db:migrate`
> (versioned migrations).

---

## 4. First login & approving users

1. Sign in with **Google** using `avikane@gmail.com` → you're auto-approved as
   **admin** and land in the library.
2. Anyone else who signs in becomes **pending** and sees a waiting screen.
3. As admin, open **Admin → Users** (avatar menu → Admin) to **approve / reject**
   users and grant/revoke admin.
4. Lost access to the admin Google account? On the pending screen, click
   **"I have an admin code"** and enter the `adminSecureCode` from
   `settings.json` to promote yourself.

---

## 5. Using it

- **Add an item** — title, category, location, free-form spec fields
  (serial no., VIN, IP range, dates…), tags.
- **Files tab** — drag in PDFs, receipts, photos. PDFs are parsed and images are
  transcribed by Claude so their contents become searchable.
- **Notes tab** — service logs, reminders, where the spare key is.
- **Ask AI tab (per item)** — ask a question; answered from your library. If it's
  not there, the agent offers to **search online** using what it knows about the
  item and **save** the documentation to the item (with the source link).
- **Ask AI (global)** — top nav → search across your entire library.

---

## Project layout

```
src/
  app/                      # Next.js App Router pages + API routes
    api/                    # items, attachments, files, search, search/web, admin, auth
    page.tsx                # library dashboard
    items/new, items/[id]   # create + detail
    search, admin, signin, pending
  components/               # UI (shadcn primitives in components/ui) + features
  lib/
    db/                     # Drizzle schema, client, migrate runner
    ai/                     # anthropic client, embeddings, extract, search, agent
    auth.ts, auth-guard.ts  # Auth.js + approval gating
    settings.ts, storage.ts # admin code + local-disk files
drizzle/                    # SQL migration
scripts/init-db.sql         # enables pgvector on DB first boot
docker-compose.yml, Dockerfile
```
