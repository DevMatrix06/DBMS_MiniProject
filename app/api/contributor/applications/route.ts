import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";

type PgError = { code?: string; message?: string };

// Apply to an open issue. Business rules (issue must be open, max 5 pending) live in the
// trg_application_rules trigger; a previously withdrawn application is reactivated.
export async function POST(req: Request) {
  const session = await requireRole("contributor");
  if (!session) return Response.json({ error: "Contributors only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const issueId = Number(body?.issueId);
  if (!Number.isInteger(issueId) || issueId < 1 || issueId > 2147483647) {
    return Response.json({ error: "issueId is required" }, { status: 400 });
  }

  const c = await pool.query("SELECT contributor_id FROM contributors WHERE user_id = $1", [session.userId]);
  if (!c.rows[0]) return Response.json({ error: "Contributor profile not found" }, { status: 404 });
  const contributorId: number = c.rows[0].contributor_id;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ application_id: number; status: string }>(
      "SELECT application_id, status FROM applications WHERE issue_id = $1 AND contributor_id = $2 FOR UPDATE",
      [issueId, contributorId]
    );

    let applicationId: number;
    if (existing.rows[0]) {
      if (existing.rows[0].status !== "withdrawn") {
        await client.query("ROLLBACK");
        return Response.json({ error: `You already applied (${existing.rows[0].status})` }, { status: 409 });
      }
      await client.query(
        "UPDATE applications SET status = 'pending', applied_at = now() WHERE application_id = $1",
        [existing.rows[0].application_id]
      );
      applicationId = existing.rows[0].application_id;
    } else {
      const ins = await client.query(
        "INSERT INTO applications (issue_id, contributor_id) VALUES ($1, $2) RETURNING application_id",
        [issueId, contributorId]
      );
      applicationId = ins.rows[0].application_id;
    }

    await client.query("COMMIT");
    return Response.json({ ok: true, applicationId, status: "pending" }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e as PgError;
    if (err.code === "P0001") return Response.json({ error: err.message }, { status: 409 }); // trigger rule
    if (err.code === "23503") return Response.json({ error: "Issue not found" }, { status: 404 });
    return Response.json({ error: "Could not apply" }, { status: 500 });
  } finally {
    client.release();
  }
}
