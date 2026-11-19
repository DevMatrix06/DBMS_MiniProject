import { Pool } from "pg";

// Reuse one pool across hot reloads in dev.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

// The app signs in as the limited role dm_app (APP_DATABASE_URL). Seed, migrate and the tests keep using
// DATABASE_URL (the owner), because they create tables and truncate data. Falls back if it is not set.
export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;
