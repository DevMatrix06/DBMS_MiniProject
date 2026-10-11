import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const { rows } = await pool.query(
    "SELECT user_id, email, role FROM users WHERE user_id = $1",
    [session.userId]
  );
  if (!rows[0]) return Response.json({ error: "Not signed in" }, { status: 401 });
  return Response.json({ user: rows[0] });
}
