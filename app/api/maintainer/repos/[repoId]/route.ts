import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseId } from "@/lib/maintainer";

// DELETE /api/maintainer/repos/:repoId
// Deletes one of the caller's repositories. ON DELETE CASCADE removes its issues, their skills,
// applications and status-log rows. Someone else's repository looks exactly like a missing one (404).
export async function DELETE(_req: Request, ctx: { params: Promise<{ repoId: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const repoId = parseId((await ctx.params).repoId);
  if (repoId === null) return Response.json({ error: "Repository not found" }, { status: 404 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query("SELECT 1 FROM repositories WHERE repo_id = $1 AND owner_id = $2 FOR UPDATE", [
      repoId,
      session.userId,
    ]);
    if (owned.rowCount === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }
    const counts = await client.query(
      `SELECT (SELECT count(*)::int FROM issues WHERE repo_id = $1) AS issues,
              (SELECT count(*)::int FROM applications a JOIN issues i ON i.issue_id = a.issue_id WHERE i.repo_id = $1) AS applications`,
      [repoId]
    );
    await client.query("DELETE FROM repositories WHERE repo_id = $1", [repoId]);
    await client.query("COMMIT");
    return Response.json({ ok: true, removed: counts.rows[0] });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json({ error: "Could not delete the repository" }, { status: 500 });
  } finally {
    client.release();
  }
}
