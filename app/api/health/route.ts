import { pool } from "@/lib/db";
import { missingSchemaObjects } from "@/lib/schema-check";

// db: can we reach the database; schema: does it contain everything this version of the app needs.
export async function GET() {
  try {
    const { rows } = await pool.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
    const missing = await missingSchemaObjects(pool);
    return Response.json({
      db: "ok",
      pgvector: rows[0]?.extversion ?? null,
      schema: missing.length === 0 ? "ok" : "outdated",
      ...(missing.length ? { missing, fix: "Run: npm run db:migrate" } : {}),
    });
  } catch {
    return Response.json({ db: "unreachable" }, { status: 503 });
  }
}
