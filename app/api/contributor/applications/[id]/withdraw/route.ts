import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";

// Withdraw one of your own pending applications.
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("contributor");
  if (!session) return Response.json({ error: "Contributors only" }, { status: 403 });

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id < 1 || id > 2147483647) {
    return Response.json({ error: "Application not found" }, { status: 404 });
  }

  // The contributor join makes someone else's application look like a missing one (404).
  const found = await pool.query<{ status: string }>(
    `SELECT a.status FROM applications a
     JOIN contributors c ON c.contributor_id = a.contributor_id
     WHERE a.application_id = $1 AND c.user_id = $2`,
    [id, session.userId]
  );
  if (!found.rows[0]) return Response.json({ error: "Application not found" }, { status: 404 });

  // The status = 'pending' condition makes this safe against a concurrent accept/reject.
  const upd = await pool.query(
    "UPDATE applications SET status = 'withdrawn' WHERE application_id = $1 AND status = 'pending'",
    [id]
  );
  if (upd.rowCount === 0) {
    return Response.json({ error: "Only pending applications can be withdrawn" }, { status: 409 });
  }
  return Response.json({ ok: true, status: "withdrawn" });
}
