import { pool } from "@/lib/db";
import { getSession, requireRole } from "@/lib/auth";

const CATEGORIES = ["language", "framework", "database", "devops", "domain", "other"];

// Skill names for filter dropdowns.
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "Not signed in" }, { status: 401 });
  const { rows } = await pool.query("SELECT skill_id, name, category FROM skills ORDER BY name");
  return Response.json({ skills: rows });
}

// A contributor adds a skill that is not in the list yet. Names are unique ignoring case, so
// "react" and "React" cannot both exist; on a duplicate the existing skill is returned with a 409.
export async function POST(req: Request) {
  if (!(await requireRole("contributor"))) return Response.json({ error: "Contributors only" }, { status: 403 });

  const input = await req.json().catch(() => null);
  const name = String(input?.name ?? "").trim().replace(/\s+/g, " ");
  const category = String(input?.category ?? "other");
  if (name.length < 1 || name.length > 40) {
    return Response.json({ error: "Skill name must be 1 to 40 characters" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) return Response.json({ error: "Unknown category" }, { status: 400 });

  const existing = await pool.query("SELECT skill_id, name, category FROM skills WHERE lower(name) = lower($1)", [name]);
  if (existing.rows[0]) {
    return Response.json({ error: "That skill already exists", skill: existing.rows[0] }, { status: 409 });
  }

  try {
    const { rows } = await pool.query(
      "INSERT INTO skills (name, category) VALUES ($1, $2) RETURNING skill_id, name, category",
      [name, category]
    );
    return Response.json({ skill: rows[0] }, { status: 201 });
  } catch (e) {
    // Two people adding the same name at the same moment: the UNIQUE constraint decides.
    if ((e as { code?: string }).code === "23505") {
      return Response.json({ error: "That skill already exists" }, { status: 409 });
    }
    return Response.json({ error: "Could not add skill" }, { status: 500 });
  }
}
