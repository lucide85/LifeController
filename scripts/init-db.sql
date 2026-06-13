-- Runs once on first DB boot (mounted into the postgres container's
-- docker-entrypoint-initdb.d). Ensures the pgvector extension exists so that
-- `npm run db:push` / `db:migrate` can create vector columns and HNSW indexes.
CREATE EXTENSION IF NOT EXISTS vector;
