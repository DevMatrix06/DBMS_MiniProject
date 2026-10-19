import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseId } from "@/lib/maintainer";

// Accepts one application. In ONE transaction:
//   1. lock the issue row (FOR UPDATE) so two accepts cannot race,
//   2. 409 if the issue is not open,
//   3. this application -> accepted, every other pending one for the issue -> rejected,
//   4. issue -> claimed (the trigger then logs open -> claimed in issue_status_log).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const applicationId = parseId((await ctx.params).id);
  if (applicationId === null) return Response.json({ error: "Application not found" }, { status: 404 });

  // Which issue does this application belong to? (issue_id never changes, so this read is safe.)
  const app = await pool.query<{ issue_id: number }>(
    "SELECT issue_id FROM applications WHERE application_id = $1",
    [applicationId]
  );
  if (app.rowCount === 0) return Response.json({ error: "Application not found" }, { status: 404 });
  const issueId = app.rows[0].issue_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Lock the issue row; the join also proves the caller owns the repository.
    const issue = await client.query<{ status: string }>(
      `SELECT i.status
       FROM issues i JOIN repositories r ON r.repo_id = i.repo_id
       WHERE i.issue_id = $1 AND r.owner_id = $2
       FOR UPDATE OF i`,
      [issueId, session.userId]
    );
    if (issue.rowCount === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Application not found" }, { status: 404 });
    }

    // 2. Only open issues can be claimed.
    if (issue.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      return Response.json({ error: `Issue is already ${issue.rows[0].status}` }, { status: 409 });
    }

    // Only a pending application can be accepted (not withdrawn / already rejected).
    const current = await client.query<{ status: string }>(
      "SELECT status FROM applications WHERE application_id = $1 FOR UPDATE",
      [applicationId]
    );
    if (current.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return Response.json({ error: `Application is ${current.rows[0].status}, not pending` }, { status: 409 });
    }

    // 3. Accept this one, reject the other pending ones.
    await client.query("UPDATE applications SET status = 'accepted' WHERE application_id = $1", [applicationId]);
    const rejected = await client.query(
      `UPDATE applications SET status = 'rejected'
       WHERE issue_id = $1 AND application_id <> $2 AND status = 'pending'`,
      [issueId, applicationId]
    );

    // 4. Claim the issue.
    await client.query("UPDATE issues SET status = 'claimed' WHERE issue_id = $1", [issueId]);

    await client.query("COMMIT");
    return Response.json({
      ok: true,
      issueId,
      acceptedApplicationId: applicationId,
      rejectedCount: rejected.rowCount ?? 0,
    });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json({ error: "Could not accept application" }, { status: 500 });
  } finally {
    client.release();
  }
}
