import { pool } from "@/lib/db";
import { destroySession, getSession, verifyPassword } from "@/lib/auth";

// DELETE /api/account  { password }
// Permanently deletes the signed-in user. ON DELETE CASCADE removes everything that depends on them:
//   contributor  -> profile, skills, applications
//   maintainer   -> repositories -> issues -> issue skills, applications, status log
// The password is required again so a stolen session cookie cannot wipe an account. Admins cannot
// delete themselves here, so the platform is never left without one.
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (session.role === "admin") {
    return Response.json({ error: "Admin accounts cannot be deleted here" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const password = String(body?.password ?? "");

  const { rows } = await pool.query("SELECT email, password_hash FROM users WHERE user_id = $1", [session.userId]);
  const user = rows[0];
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!password || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "Password is incorrect" }, { status: 403 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Counts are returned so the caller (and the tests) can see the cascade at work.
    const [apps, repos] = await Promise.all([
      client.query(
        `SELECT count(*)::int AS n FROM applications a
         WHERE a.contributor_id IN (SELECT contributor_id FROM contributors WHERE user_id = $1)
            OR a.issue_id IN (SELECT i.issue_id FROM issues i JOIN repositories r ON r.repo_id = i.repo_id WHERE r.owner_id = $1)`,
        [session.userId]
      ),
      client.query("SELECT count(*)::int AS n FROM repositories WHERE owner_id = $1", [session.userId]),
    ]);
    await client.query("DELETE FROM login_attempts WHERE email = $1", [user.email]);
    await client.query("DELETE FROM users WHERE user_id = $1", [session.userId]);
    await client.query("COMMIT");
    await destroySession();
    return Response.json({ ok: true, removed: { applications: apps.rows[0].n, repositories: repos.rows[0].n } });
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return Response.json({ error: "Could not delete the account" }, { status: 500 });
  } finally {
    client.release();
  }
}
