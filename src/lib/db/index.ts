import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Lazy initialization: importing this module must NOT require DATABASE_URL or open
// a connection. `next build` imports route modules to collect page data, so any
// top-level throw / connection here would break the build. We defer everything to
// the first actual query at runtime.
const globalForDb = globalThis as unknown as {
  client?: ReturnType<typeof postgres>;
  db?: PostgresJsDatabase<typeof schema>;
};

function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.db) return globalForDb.db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }

  // Reuse the postgres client across hot reloads in development.
  const client =
    globalForDb.client ?? postgres(connectionString, { max: 10, prepare: false });
  if (process.env.NODE_ENV !== "production") globalForDb.client = client;

  const instance = drizzle(client, { schema });
  globalForDb.db = instance;
  return instance;
}

// A proxy that initializes the real Drizzle instance on first property access, so
// `import { db }` is side-effect-free until a query actually runs.
export const db = new Proxy({} as PostgresJsDatabase<typeof schema>, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export { schema };
