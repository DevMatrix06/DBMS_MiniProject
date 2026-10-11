import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { embed, toVectorLiteral } from "@/lib/embeddings";
import {
  DIFFICULTIES,
  issueEmbeddingText,
  parseId,
  parseSkillIds,
  type Difficulty,
  type PgError,
} from "@/lib/maintainer";

// Creates an issue in a repository the caller owns, with its skills and embedding.
export async function POST(req: Request) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const input = await req.json().catch(() => null);
  const repoId = parseId(input?.repoId);
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  const difficulty = (input?.difficulty ?? "medium") as Difficulty;
  const skillIds = parseSkillIds(input?.skillIds ?? []);

  if (repoId === null) return Response.json({ error: "repoId is required" }, { status: 400 });
  if (title.length < 5 || title.length > 300) {
    return Response.json({ error: "Title must be 5 to 300 characters" }, { status: 400 });
  }
  if (!body) return Response.json({ error: "Body is required" }, { status: 400 });
  if (!DIFFICULTIES.includes(difficulty)) {
    return Response.json({ error: "Difficulty must be easy, medium or hard" }, { status: 400 });
  }
  if (skillIds === null) {
    return Response.json({ error: "skillIds must be an array of up to 20 skill ids" }, { status: 400 });
  }

  // Ownership: another maintainer's repo looks exactly like a missing one (404).
  const repo = await pool.query("SELECT 1 FROM repositories WHERE repo_id = $1 AND owner_id = $2", [
    repoId,
    session.userId,
  ]);
  if (repo.rowCount === 0) return Response.json({ error: "Repository not found" }, { status: 404 });

  const skills = await pool.query<{ name: string }>(
    "SELECT name FROM skills WHERE skill_id = ANY($1::int[]) ORDER BY name",
    [skillIds]
  );
  if (skills.rowCount !== skillIds.length) {
    return Response.json({ error: "Unknown skill in skillIds" }, { status: 400 });
  }

  // Embed first (network call), so a failing API call never leaves a half-written issue.
  let vector: string;
  try {
    vector = toVectorLiteral(await embed(issueEmbeddingText(title, body, skills.rows.map((s) => s.name))));
  } catch {
    return Response.json({ error: "Could not generate embedding, try again" }, { status: 502 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO issues (repo_id, title, body, difficulty, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING issue_id, repo_id, title, body, difficulty, status, created_at`,
      [repoId, title, body, difficulty, vector]
    );
    if (skillIds.length > 0) {
      await client.query("INSERT INTO issue_skills (issue_id, skill_id) SELECT $1, unnest($2::int[])", [
        rows[0].issue_id,
        skillIds,
      ]);
    }
    await client.query("COMMIT");
    return Response.json({ issue: { ...rows[0], skillIds } }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e as PgError;
    if (err.code === "23514") {
      return Response.json({ error: "Invalid input (failed a database check)" }, { status: 400 });
    }
    return Response.json({ error: "Could not create issue" }, { status: 500 });
  } finally {
    client.release();
  }
}
