import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseId } from "@/lib/maintainer";

// Rejects one pending application of an issue in one of the caller's repositories.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const applicationId = parseId((await ctx.params).id);
  if (applicationId === null) return Response.json({ error: "Application not found" }, { status: 404 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the application row; the joins prove the caller owns the repository.
    const found = await client.query<{ status: string }>(
      `SELECT a.status
       FROM applications a
       JOIN issues i       ON i.issue_id = a.issue_id
       JOIN repositories r ON r.repo_id = i.repo_id
       WHERE a.application_id = $1 AND r.owner_id = $2
       FOR UPDATE OF a`,
      [applicationId, session.userId]
    );
    if (found.rowCount === 0) {
      await client.query("ROLLBACK");
      return Response.json({ error: "Application not found" }, { status: 404 });
    }
    if (found.rows[0].status !== "pending") {
      await client.query("ROLLBACK");
      return Response.json({ error: `Application is ${found.rows[0].status}, not pending` }, { status: 409 });
    }

    await client.query("UPDATE applications SET status = 'rejected' WHERE application_id = $1", [applicationId]);
    await client.query("COMMIT");
    return Response.json({ ok: true, applicationId });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json({ error: "Could not reject application" }, { status: 500 });
  } finally {
    client.release();
  }
}
