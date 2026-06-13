# LifeController

> Your single source of truth for **everything you own and care about** — houses,
> bikes, motorcycles, computers, networks, cabins, boats, travel plans… anything.
> Keep files, receipts, images, specs and notes in one place, and ask an **AI
> agent** to find whatever you need. If it isn't stored yet, the agent searches
> the web using what it knows about the item and saves the documentation back,
> citing where it came from.

![stack](https://img.shields.io/badge/Next.js-App_Router-black) ![db](https://img.shields.io/badge/PostgreSQL-pgvector-blue) ![ai](https://img.shields.io/badge/Claude-embeddings_%2B_web_search-7c3aed)

## Features

- 🗂️ **Generic items** — any category, with free-form spec fields (serial no.,
  VIN, IP range, dates…), tags and location.
- 📎 **Files, receipts & images** on local disk. PDFs parsed, images transcribed
  by Claude → all searchable.
- 🧠 **AI agent** — semantic search (pgvector embeddings) + Claude answers grounded
  only in your library.
- 🌐 **Web fallback** — when something isn't in your library, the agent looks it
  up online using the item's own details and stores the doc with its source URL.
- 🔐 **Google login, admin-gated** — new users wait for approval; admin is
  `avikane@gmail.com` or anyone with the secure code in `settings.json`.
- ✨ **Premium UI** — shadcn/ui, glassmorphism, aurora gradients, dark mode.

## Quick start

```bash
cp .env.example .env            # fill in secrets (see SETUP.md)
cp settings.example.json settings.json
docker compose up -d db
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000
```

Sign in with `avikane@gmail.com` → auto-admin. Full instructions, Google OAuth
setup, and VPS/Docker deployment are in **[SETUP.md](SETUP.md)**.

## Tech

Next.js · TypeScript · PostgreSQL + pgvector · Drizzle ORM · Auth.js (Google) ·
Anthropic Claude (`claude-opus-4-8`) · Voyage AI embeddings · Tailwind + shadcn/ui.
