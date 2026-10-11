import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// Issues semantically closest to the signed-in contributor's profile (uses match_issues()).
export async function GET(req: Request) {
  const session = await requireRole("contributor");
  if (!session) return Response.json({ error: "Contributors only" }, { status: 403 });

  const limit = Math.min(Math.max(Number(new URL(req.url).searchParams.get("limit")) || 10, 1), 50);

  const c = await pool.query("SELECT contributor_id FROM contributors WHERE user_id = $1", [session.userId]);
  if (!c.rows[0]) return Response.json({ error: "Contributor profile not found" }, { status: 404 });

  const { rows } = await pool.query("SELECT * FROM match_issues($1, $2)", [c.rows[0].contributor_id, limit]);
  return Response.json({ matches: rows });
}
