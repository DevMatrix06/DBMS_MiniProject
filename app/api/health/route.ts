import { pool } from "@/lib/db";

export async function GET() {
  try {
    const { rows } = await pool.query(
      "SELECT extversion FROM pg_extension WHERE extname = 'vector'"
    );
    return Response.json({ db: "ok", pgvector: rows[0]?.extversion ?? null });
  } catch {
    return Response.json({ db: "unreachable" }, { status: 503 });
  }
}
