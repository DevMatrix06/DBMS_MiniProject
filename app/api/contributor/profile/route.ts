import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { embed, toVectorLiteral } from "@/lib/embeddings";

const LEVELS = ["beginner", "intermediate", "advanced"];

// Updates bio, level and skills, then re-embeds the profile so matching reflects the change.
export async function PUT(req: Request) {
  const session = await requireRole("contributor");
  if (!session) return Response.json({ error: "Contributors only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const bio = String(body?.bio ?? "").trim();
  const level = String(body?.experienceLevel ?? "");
  const rawSkills: unknown = body?.skills;

  if (bio.length < 10 || bio.length > 1000) {
    return Response.json({ error: "Bio must be 10 to 1000 characters" }, { status: 400 });
  }
  if (!LEVELS.includes(level)) {
    return Response.json({ error: "Invalid experience level" }, { status: 400 });
  }
  if (!Array.isArray(rawSkills) || rawSkills.length === 0 || rawSkills.length > 30) {
    return Response.json({ error: "Pick between 1 and 30 skills" }, { status: 400 });
  }
  const skills = rawSkills.map((s) => ({
    skillId: Number((s as { skillId?: unknown })?.skillId),
    proficiency: Number((s as { proficiency?: unknown })?.proficiency),
  }));
  if (skills.some((s) => !Number.isInteger(s.skillId) || !Number.isInteger(s.proficiency) || s.proficiency < 1 || s.proficiency > 5)) {
    return Response.json({ error: "Invalid skill selection" }, { status: 400 });
  }
  if (new Set(skills.map((s) => s.skillId)).size !== skills.length) {
    return Response.json({ error: "Duplicate skills" }, { status: 400 });
  }

  const names = await pool.query("SELECT name FROM skills WHERE skill_id = ANY($1::int[]) ORDER BY name", [
    skills.map((s) => s.skillId),
  ]);
  if (names.rows.length !== skills.length) {
    return Response.json({ error: "Unknown skill" }, { status: 400 });
  }

  let vector: string;
  try {
    vector = toVectorLiteral(await embed(`${bio}\nSkills: ${names.rows.map((r) => r.name).join(", ")}`));
  } catch {
    return Response.json({ error: "Could not compute embedding, try again" }, { status: 502 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      `UPDATE contributors SET bio = $2, experience_level = $3, profile_embedding = $4::vector
       WHERE user_id = $1 RETURNING contributor_id`,
      [session.userId, bio, level, vector]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Contributor profile not found" }, { status: 404 });
    }
    const cid = upd.rows[0].contributor_id;
    await client.query("DELETE FROM contributor_skills WHERE contributor_id = $1", [cid]);
    await client.query(
      `INSERT INTO contributor_skills (contributor_id, skill_id, proficiency)
       SELECT $1, s.skill_id, s.proficiency
       FROM unnest($2::int[], $3::int[]) AS s(skill_id, proficiency)`,
      [cid, skills.map((s) => s.skillId), skills.map((s) => s.proficiency)]
    );
    await client.query("COMMIT");
    return Response.json({ ok: true });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json({ error: "Could not save profile" }, { status: 500 });
  } finally {
    client.release();
  }
}
