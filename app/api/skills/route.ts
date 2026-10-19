import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth";

// Skill names for filter dropdowns.
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { rows } = await pool.query("SELECT skill_id, name, category FROM skills ORDER BY name");
  return Response.json({ skills: rows });
}
