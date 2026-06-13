// Standalone migration runner: enables the pgvector extension, then applies all
// generated Drizzle migrations. Run with `npm run db:migrate`.
import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const migrationClient = postgres(url, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("→ Enabling pgvector extension...");
  await migrationClient`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log("→ Applying migrations from ./drizzle ...");
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("✓ Migrations complete.");
  await migrationClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("✗ Migration failed:", err);
  process.exit(1);
});
