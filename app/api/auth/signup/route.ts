import { pool } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";

type PgError = { code?: string; constraint?: string };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = body?.role;
  const displayName = String(body?.displayName ?? "").trim();
  const githubUsername = String(body?.githubUsername ?? "").trim();

  if (role !== "contributor" && role !== "maintainer") {
    return Response.json({ error: "Role must be contributor or maintainer" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (role === "contributor" && (!displayName || !githubUsername)) {
    return Response.json({ error: "Display name and GitHub username are required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id",
      [email, await hashPassword(password), role]
    );
    const userId: number = rows[0].user_id;

    if (role === "contributor") {
      await client.query(
        "INSERT INTO contributors (user_id, display_name, github_username) VALUES ($1, $2, $3)",
        [userId, displayName, githubUsername]
      );
    }
    await client.query("COMMIT");

    await createSession({ userId, role });
    return Response.json({ ok: true, role }, { status: 201 });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    const err = e as PgError;
    if (err.code === "23505") {
      const what = err.constraint?.includes("github") ? "GitHub username" : "Email";
      return Response.json({ error: `${what} is already registered` }, { status: 409 });
    }
    if (err.code === "23514") {
      return Response.json({ error: "Invalid input (failed a database check)" }, { status: 400 });
    }
    return Response.json({ error: "Signup failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
