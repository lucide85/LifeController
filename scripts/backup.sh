#!/usr/bin/env bash
# Back up the database (pg_dump) and the uploaded files (uploads volume).
# Writes timestamped archives into ./backups.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f compose.prod.yml"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p backups

# Compose lowercases the project (directory) name to prefix volume names.
PROJECT=$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')
UPLOADS_VOL="${PROJECT}_lc_uploads"

echo "→ Dumping database…"
$COMPOSE exec -T db pg_dump -U lifecontroller -d lifecontroller \
  | gzip > "backups/db-${STAMP}.sql.gz"

echo "→ Archiving uploads volume (${UPLOADS_VOL})…"
docker run --rm \
  -v "${UPLOADS_VOL}:/data:ro" \
  -v "$PWD/backups:/backup" \
  alpine tar czf "/backup/uploads-${STAMP}.tar.gz" -C /data .

echo "✓ Backups written:"
echo "    backups/db-${STAMP}.sql.gz"
echo "    backups/uploads-${STAMP}.tar.gz"
