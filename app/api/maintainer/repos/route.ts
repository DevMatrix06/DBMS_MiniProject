import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { OWN_REPOS_SQL, optionalText, type PgError } from "@/lib/maintainer";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

// Lists only the caller's repositories, each with its open-issue count.
export async function GET() {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const { rows } = await pool.query(OWN_REPOS_SQL, [session.userId]);
  return Response.json({ repos: rows });
}

// Creates a repository owned by the signed-in maintainer.
export async function POST(req: Request) {
  const session = await requireRole("maintainer");
  if (!session) return Response.json({ error: "Maintainers only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.full_name === "string" ? body.full_name.trim() : "";
  const description = optionalText(body?.description, 2000);
  const primaryLanguage = optionalText(body?.primary_language, 50);

  if (!FULL_NAME_RE.test(fullName)) {
    return Response.json({ error: 'full_name must look like "owner/repo"' }, { status: 400 });
  }
  if (description === false) {
    return Response.json({ error: "description must be text up to 2000 characters" }, { status: 400 });
  }
  if (primaryLanguage === false) {
    return Response.json({ error: "primary_language must be text up to 50 characters" }, { status: 400 });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO repositories (owner_id, full_name, description, primary_language)
       VALUES ($1, $2, $3, $4)
       RETURNING repo_id, full_name, description, primary_language, stars, created_at`,
      [session.userId, fullName, description, primaryLanguage]
    );
    return Response.json({ repo: rows[0] }, { status: 201 });
  } catch (e) {
    const err = e as PgError;
    if (err.code === "23505") {
      return Response.json({ error: "A repository with that name already exists" }, { status: 409 });
    }
    if (err.code === "23514") {
      return Response.json({ error: "Invalid input (failed a database check)" }, { status: 400 });
    }
    return Response.json({ error: "Could not create repository" }, { status: 500 });
  }
}
