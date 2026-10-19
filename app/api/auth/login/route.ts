import { pool } from "@/lib/db";
import { createSession, verifyPassword, type Role } from "@/lib/auth";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(body?.password ?? "");

  // Brute-force protection: too many recent failures for this email blocks further attempts,
  // even with the right password. Unknown emails are tracked too, so the response never
  // reveals whether an account exists.
  let recent;
  try {
    recent = await pool.query<{ n: number; retry_after: number }>(
      `SELECT count(*)::int AS n,
              COALESCE(CEIL(EXTRACT(EPOCH FROM (min(attempted_at) + make_interval(mins => $2) - now()))), 0)::int AS retry_after
       FROM login_attempts
       WHERE email = $1 AND attempted_at > now() - make_interval(mins => $2)`,
      [email, WINDOW_MINUTES]
    );
  } catch (e) {
    // 42P01 = undefined_table: the database was created before db/10_login_attempts.sql existed.
    if ((e as { code?: string }).code === "42P01") {
      return Response.json(
        { error: "The database is out of date (login_attempts table is missing). Run: npm run db:migrate" },
        { status: 503 }
      );
    }
    return Response.json({ error: "Could not reach the database. Is it running?" }, { status: 503 });
  }
  if (recent.rows[0].n >= MAX_FAILURES) {
    const wait = Math.max(recent.rows[0].retry_after, 1);
    return Response.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minute(s).` },
      { status: 429, headers: { "Retry-After": String(wait) } }
    );
  }

  const { rows } = await pool.query(
    "SELECT user_id, password_hash, role FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  // Same message for unknown email and wrong password.
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    await pool.query("INSERT INTO login_attempts (email) VALUES ($1)", [email]);
    // Housekeeping: old attempts are irrelevant to the window.
    await pool.query("DELETE FROM login_attempts WHERE attempted_at < now() - interval '1 day'");
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  await pool.query("DELETE FROM login_attempts WHERE email = $1", [email]);
  await createSession({ userId: user.user_id, role: user.role as Role });
  return Response.json({ ok: true, role: user.role });
}
