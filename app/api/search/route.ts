import { pool } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { embed, toVectorLiteral } from "@/lib/embeddings";

const DIFFICULTIES = ["easy", "medium", "hard"];

// GET /api/search?q=...&mode=semantic|keyword|hybrid[&difficulty=easy|medium|hard][&skill=Python]
// semantic: pgvector cosine distance on issue embeddings
// keyword:  PostgreSQL full-text search (GIN index on search_tsv)
// hybrid:   both, fused with Reciprocal Rank Fusion in the hybrid_search() SQL function
// The optional filters narrow the candidate issues before ranking (see idx_issue_skills_skill and
// idx_issues_status_difficulty).
export async function GET(req: Request) {
  if (!(await getSession())) return Response.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim();
  const requested = params.get("mode");
  const mode = requested === "keyword" || requested === "hybrid" ? requested : "semantic";
  if (q.length < 2 || q.length > 300) {
    return Response.json({ error: "Query must be 2 to 300 characters" }, { status: 400 });
  }

  const difficultyParam = params.get("difficulty");
  if (difficultyParam && !DIFFICULTIES.includes(difficultyParam)) {
    return Response.json({ error: "difficulty must be easy, medium or hard" }, { status: 400 });
  }
  const skillParam = (params.get("skill") ?? "").trim();
  if (skillParam.length > 50) return Response.json({ error: "skill is too long" }, { status: 400 });
  const difficulty = difficultyParam || null;
  const skill = skillParam || null;

  // Reused by the keyword and semantic queries below ($2 = difficulty, $3 = skill, for keyword;
  // the semantic query uses the same positions).
  const filters = `AND ($2::text IS NULL OR i.difficulty = $2)
       AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
                                        WHERE isk.issue_id = i.issue_id AND s.name = $3))`;

  if (mode === "keyword") {
    const { rows } = await pool.query(
      `SELECT i.issue_id, i.title, r.full_name AS repo_name, i.difficulty,
              ts_rank(i.search_tsv, query)::real AS score
       FROM issues i
       JOIN repositories r ON r.repo_id = i.repo_id,
            websearch_to_tsquery('english', $1) AS query
       WHERE i.status = 'open' AND i.search_tsv @@ query
       ${filters}
       ORDER BY score DESC
       LIMIT 10`,
      [q, difficulty, skill]
    );
    return Response.json({ mode, results: rows });
  }

  try {
    const vec = toVectorLiteral(await embed(q));

    if (mode === "hybrid") {
      const { rows } = await pool.query(
        `SELECT issue_id, title, repo_name, difficulty, score, in_semantic, in_keyword
         FROM hybrid_search($1, $2::vector, 10, $3, $4)`,
        [q, vec, difficulty, skill]
      );
      return Response.json({ mode, results: rows });
    }

    const { rows } = await pool.query(
      `SELECT i.issue_id, i.title, r.full_name AS repo_name, i.difficulty,
              (1 - (i.embedding <=> $1::vector))::real AS score
       FROM issues i
       JOIN repositories r ON r.repo_id = i.repo_id
       WHERE i.status = 'open' AND i.embedding IS NOT NULL
       ${filters}
       ORDER BY i.embedding <=> $1::vector
       LIMIT 10`,
      [vec, difficulty, skill]
    );
    return Response.json({ mode, results: rows });
  } catch {
    return Response.json({ error: "Semantic search is unavailable" }, { status: 502 });
  }
}
