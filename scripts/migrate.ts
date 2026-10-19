// Usage: npm run db:migrate
// Brings an EXISTING database up to date with the latest db/*.sql, without wiping any data.
// (A brand new database does not need this: docker compose runs the init scripts itself.)
//
// Only the re-runnable files are applied: views, rules, functions, tables and indexes that are written
// with DROP ... IF EXISTS / CREATE OR REPLACE / IF NOT EXISTS. 01-03 (base schema) and the demo scripts
// 05/06 are never re-run.
import fs from "node:fs";
import pg from "pg";
import { REQUIRED_OBJECTS, missingSchemaObjects } from "../lib/schema-check.ts";

const FILES = [
  "04_views.sql",
  "07_application_rules.sql",
  "08_close_issue_rule.sql",
  "09_hybrid_search.sql",
  "10_login_attempts.sql",
  "11_filter_indexes.sql",
];

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy .env.example to .env first.");

  const before = await missingSchemaObjects(pool);
  console.log(before.length ? `Missing before: ${before.join(", ")}` : "Schema already up to date; re-applying files anyway.");

  for (const f of FILES) {
    const sql = fs.readFileSync(new URL(`../db/${f}`, import.meta.url), "utf8");
    await pool.query(sql);
    console.log(`  applied ${f}`);
  }

  const after = await missingSchemaObjects(pool);
  if (after.length) {
    console.error(`Still missing: ${after.join(", ")}\nThe base schema (db/01 to db/03) may not be loaded. To rebuild from scratch: docker compose down -v, then docker compose up -d, then npm run seed.`);
    process.exitCode = 1;
  } else {
    console.log(`Done. All ${REQUIRED_OBJECTS.length} required database objects are present.`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
