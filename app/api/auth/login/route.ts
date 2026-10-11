import { pool } from "@/lib/db";
import { createSession, verifyPassword, type Role } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");

  const { rows } = await pool.query(
    "SELECT user_id, password_hash, role FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  // Same message for unknown email and wrong password.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await createSession({ userId: user.user_id, role: user.role as Role });
  return Response.json({ ok: true, role: user.role });
}
