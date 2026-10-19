import { pool } from "@/lib/db";
import { getSession, hashPassword, verifyPassword } from "@/lib/auth";

// PUT /api/account/password  { currentPassword, newPassword }
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const current = String(body?.currentPassword ?? "");
  const next = String(body?.newPassword ?? "");

  if (next.length < 8) return Response.json({ error: "New password must be at least 8 characters" }, { status: 400 });
  if (next.length > 200) return Response.json({ error: "New password is too long" }, { status: 400 });

  const { rows } = await pool.query("SELECT password_hash FROM users WHERE user_id = $1", [session.userId]);
  if (!rows[0]) return Response.json({ error: "Not signed in" }, { status: 401 });
  if (!(await verifyPassword(current, rows[0].password_hash))) {
    return Response.json({ error: "Current password is incorrect" }, { status: 403 });
  }
  if (current === next) return Response.json({ error: "Choose a different password" }, { status: 400 });

  await pool.query("UPDATE users SET password_hash = $2 WHERE user_id = $1", [session.userId, await hashPassword(next)]);
  return Response.json({ ok: true });
}
