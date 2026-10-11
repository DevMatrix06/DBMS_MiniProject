import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { APPLICANTS_SQL, parseId } from "@/lib/maintainer";

// Applicants of one of the caller's issues: name, skills, experience level, applied_at (+ match score).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const issueId = parseId((await ctx.params).id);
  if (issueId === null) return Response.json({ error: "Issue not found" }, { status: 404 });

  const own = await pool.query(
    `SELECT 1 FROM issues i JOIN repositories r ON r.repo_id = i.repo_id
     WHERE i.issue_id = $1 AND r.owner_id = $2`,
    [issueId, session.userId]
  );
  if (own.rowCount === 0) return Response.json({ error: "Issue not found" }, { status: 404 });

  const { rows } = await pool.query(APPLICANTS_SQL, [issueId]);
  return Response.json({ applications: rows });
}
