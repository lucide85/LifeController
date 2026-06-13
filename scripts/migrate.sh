#!/usr/bin/env bash
# Apply the database schema using psql inside the db container — no Node required.
# The drizzle migration file's "--> statement-breakpoint" markers are SQL comments,
# so psql runs the whole file directly. Safe to re-run (idempotent).
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f compose.prod.yml"

echo "→ Waiting for the database to be ready…"
until $COMPOSE exec -T db pg_isready -U lifecontroller -d lifecontroller >/dev/null 2>&1; do
  sleep 1
done

echo "→ Applying schema (drizzle/0000_init.sql)…"
$COMPOSE exec -T db psql -v ON_ERROR_STOP=1 -U lifecontroller -d lifecontroller \
  < drizzle/0000_init.sql

echo "✓ Schema applied."
