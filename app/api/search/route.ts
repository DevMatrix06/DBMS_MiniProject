import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { embed, toVectorLiteral } from "@/lib/embeddings";

// GET /api/search?q=...&mode=semantic|keyword
// semantic: pgvector cosine distance on issue embeddings
// keyword:  PostgreSQL full-text search (GIN index on search_tsv)
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const mode = params.get("mode") === "keyword" ? "keyword" : "semantic";
  if (q.length < 2 || q.length > 300) {
    return Response.json({ error: "Query must be 2 to 300 characters" }, { status: 400 });
  }

  if (mode === "keyword") {
    const { rows } = await pool.query(
      `SELECT i.issue_id, i.title, r.full_name AS repo_name, i.difficulty,
              ts_rank(i.search_tsv, query)::real AS score
       FROM issues i
       JOIN repositories r ON r.repo_id = i.repo_id,
            websearch_to_tsquery('english', $1) AS query
       WHERE i.status = 'open' AND i.search_tsv @@ query
       ORDER BY score DESC
       LIMIT 10`,
      [q]
    );
    return Response.json({ mode, results: rows });
  }

  try {
    const vec = toVectorLiteral(await embed(q));
    const { rows } = await pool.query(
      `SELECT i.issue_id, i.title, r.full_name AS repo_name, i.difficulty,
              (1 - (i.embedding <=> $1::vector))::real AS score
       FROM issues i
       JOIN repositories r ON r.repo_id = i.repo_id
       WHERE i.status = 'open' AND i.embedding IS NOT NULL
       ORDER BY i.embedding <=> $1::vector
       LIMIT 10`,
      [vec]
    );
    return Response.json({ mode, results: rows });
  } catch {
    return Response.json({ error: "Semantic search is unavailable" }, { status: 502 });
  }
}
