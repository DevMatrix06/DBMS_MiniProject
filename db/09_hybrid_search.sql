-- Hybrid search: combines PostgreSQL full-text ranking and pgvector similarity with
-- Reciprocal Rank Fusion (RRF): score = 1/(60 + rank_semantic) + 1/(60 + rank_keyword).
-- An issue found by both methods ranks above one found by only one, and neither raw score scale
-- (ts_rank vs cosine distance) needs to be normalised.
-- Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/09_hybrid_search.sql

-- Optional filters (difficulty, skill name) are applied BEFORE ranking, so the top 30 of each method
-- already respect them. NULL means "no filter".
DROP FUNCTION IF EXISTS hybrid_search(TEXT, vector, INT);
CREATE OR REPLACE FUNCTION hybrid_search(p_query TEXT, p_embedding vector(768), p_limit INT DEFAULT 10,
                                         p_difficulty TEXT DEFAULT NULL, p_skill TEXT DEFAULT NULL)
RETURNS TABLE (issue_id INT, title TEXT, repo_name TEXT, difficulty TEXT,
               score REAL, in_semantic BOOLEAN, in_keyword BOOLEAN)
LANGUAGE sql STABLE AS $$
    WITH sem AS (            -- top 30 by cosine distance (uses the HNSW index)
        SELECT s.issue_id, row_number() OVER (ORDER BY s.dist) AS rnk
        FROM (SELECT i.issue_id, i.embedding <=> p_embedding AS dist
              FROM issues i
              WHERE i.status = 'open' AND i.embedding IS NOT NULL
                AND (p_difficulty IS NULL OR i.difficulty = p_difficulty)
                AND (p_skill IS NULL OR EXISTS (SELECT 1 FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
                                                WHERE isk.issue_id = i.issue_id AND s.name = p_skill))
              ORDER BY i.embedding <=> p_embedding
              LIMIT 30) s
    ),
    kw AS (                  -- top 30 by full-text rank (uses the GIN index)
        SELECT k.issue_id, row_number() OVER (ORDER BY k.rank DESC) AS rnk
        FROM (SELECT i.issue_id, ts_rank(i.search_tsv, q) AS rank
              FROM issues i, websearch_to_tsquery('english', p_query) q
              WHERE i.status = 'open' AND i.search_tsv @@ q
                AND (p_difficulty IS NULL OR i.difficulty = p_difficulty)
                AND (p_skill IS NULL OR EXISTS (SELECT 1 FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
                                                WHERE isk.issue_id = i.issue_id AND s.name = p_skill))
              ORDER BY ts_rank(i.search_tsv, q) DESC
              LIMIT 30) k
    )
    SELECT i.issue_id,
           i.title,
           r.full_name,
           i.difficulty,
           (COALESCE(1.0 / (60 + sem.rnk), 0) + COALESCE(1.0 / (60 + kw.rnk), 0))::REAL,
           sem.issue_id IS NOT NULL,
           kw.issue_id IS NOT NULL
    FROM issues i
    JOIN repositories r ON r.repo_id = i.repo_id
    LEFT JOIN sem ON sem.issue_id = i.issue_id
    LEFT JOIN kw  ON kw.issue_id  = i.issue_id
    WHERE sem.issue_id IS NOT NULL OR kw.issue_id IS NOT NULL
    ORDER BY 5 DESC, i.issue_id
    LIMIT p_limit;
$$;
