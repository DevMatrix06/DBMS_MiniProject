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

// Edits an issue (title, body, difficulty, skills) or closes it ({ "status": "closed" }).
// The issue is locked with FOR UPDATE so two concurrent edits cannot interleave.
// Re-embeds when the title, body or skills changed.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const issueId = parseId((await ctx.params).id);
  if (issueId === null) return Response.json({ error: "Issue not found" }, { status: 404 });

  const input = await req.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = input.title === undefined ? undefined : typeof input.title === "string" ? input.title.trim() : null;
  const body = input.body === undefined ? undefined : typeof input.body === "string" ? input.body.trim() : null;
  const difficulty = input.difficulty as Difficulty | undefined;
  const status = input.status as string | undefined;
  const skillIds = input.skillIds === undefined ? undefined : parseSkillIds(input.skillIds);

  if (title === null || (title !== undefined && (title.length < 5 || title.length > 300))) {
    return Response.json({ error: "Title must be 5 to 300 characters" }, { status: 400 });
  }
  if (body === null || body === "") return Response.json({ error: "Body cannot be empty" }, { status: 400 });
  if (difficulty !== undefined && !DIFFICULTIES.includes(difficulty)) {
    return Response.json({ error: "Difficulty must be easy, medium or hard" }, { status: 400 });
  }
  if (status !== undefined && status !== "closed") {
    return Response.json({ error: 'Only status "closed" can be set here' }, { status: 400 });
  }
  if (skillIds === null) {
    return Response.json({ error: "skillIds must be an array of up to 20 skill ids" }, { status: 400 });
  }
  if ([title, body, difficulty, status, skillIds].every((v) => v === undefined)) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the row and check ownership in one statement.
    const cur = await client.query<{ title: string; body: string; difficulty: string; status: string }>(
      `SELECT i.title, i.body, i.difficulty, i.status
       FROM issues i JOIN repositories r ON r.repo_id = i.repo_id
       WHERE i.issue_id = $1 AND r.owner_id = $2
       FOR UPDATE OF i`,
      [issueId, session.userId]
    );
    if (cur.rowCount === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Issue not found" }, { status: 404 });
    }
    const row = cur.rows[0];
    if (row.status === "closed") {
      await client.query("ROLLBACK");
      return Response.json({ error: "Issue is already closed" }, { status: 409 });
    }

    const newTitle = title ?? row.title;
    const newBody = body ?? row.body;

    // Skill names for the embedding text: the new selection if given, else the current skills.
    const skillRows =
      skillIds !== undefined
        ? await client.query<{ name: string }>(
            "SELECT name FROM skills WHERE skill_id = ANY($1::int[]) ORDER BY name",
            [skillIds]
          )
        : await client.query<{ name: string }>(
            `SELECT s.name FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
             WHERE isk.issue_id = $1 ORDER BY s.name`,
            [issueId]
          );
    if (skillIds !== undefined && skillRows.rowCount !== skillIds.length) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Unknown skill in skillIds" }, { status: 400 });
    }

    const reEmbed = newTitle !== row.title || newBody !== row.body || skillIds !== undefined;
    let vector: string | null = null;
    if (reEmbed) {
      try {
        vector = toVectorLiteral(await embed(issueEmbeddingText(newTitle, newBody, skillRows.rows.map((s) => s.name))));
      } catch {
        await client.query("ROLLBACK");
        return Response.json({ error: "Could not generate embedding, try again" }, { status: 502 });
      }
    }

    // A status change here fires trg_issue_status_log, which writes the audit row.
    const { rows } = await client.query(
      `UPDATE issues
       SET title = $2, body = $3, difficulty = $4, status = $5,
           embedding = COALESCE($6::vector, embedding)
       WHERE issue_id = $1
       RETURNING issue_id, repo_id, title, body, difficulty, status`,
      [issueId, newTitle, newBody, difficulty ?? row.difficulty, status ?? row.status, vector]
    );

    if (skillIds !== undefined) {
      await client.query("DELETE FROM issue_skills WHERE issue_id = $1", [issueId]);
      if (skillIds.length > 0) {
        await client.query("INSERT INTO issue_skills (issue_id, skill_id) SELECT $1, unnest($2::int[])", [
          issueId,
          skillIds,
        ]);
      }
    }

    await client.query("COMMIT");
    return Response.json({ issue: rows[0], reEmbedded: reEmbed });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e as PgError;
    if (err.code === "23514") {
      return Response.json({ error: "Invalid input (failed a database check)" }, { status: 400 });
    }
    return Response.json({ error: "Could not update issue" }, { status: 500 });
  } finally {
    client.release();
  }
}
