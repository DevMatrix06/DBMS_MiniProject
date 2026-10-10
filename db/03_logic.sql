-- Trigger: audit every issue status change
CREATE OR REPLACE FUNCTION log_issue_status_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO issue_status_log (issue_id, old_status, new_status)
        VALUES (OLD.issue_id, OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_issue_status_log
AFTER UPDATE ON issues
FOR EACH ROW EXECUTE FUNCTION log_issue_status_change();

-- Semantic matching: top-k open issues closest to a contributor profile (cosine distance)
CREATE OR REPLACE FUNCTION match_issues(p_contributor_id INT, p_limit INT DEFAULT 10)
RETURNS TABLE (issue_id INT, title TEXT, repo_name TEXT, difficulty TEXT, similarity REAL)
LANGUAGE sql STABLE AS $$
    SELECT i.issue_id,
           i.title,
           r.full_name,
           i.difficulty,
           (1 - (i.embedding <=> c.profile_embedding))::REAL
    FROM contributors c
    JOIN issues i        ON i.status = 'open' AND i.embedding IS NOT NULL
    JOIN repositories r  ON r.repo_id = i.repo_id
    WHERE c.contributor_id = p_contributor_id
      AND c.profile_embedding IS NOT NULL
    ORDER BY i.embedding <=> c.profile_embedding
    LIMIT p_limit;
$$;
