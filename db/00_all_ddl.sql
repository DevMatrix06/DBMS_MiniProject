-- DevMatch: ALL DDL in one file (tables, indexes, views, functions, procedure, triggers).
-- Order matters. Run on an empty database:  psql -U devmatch -d devmatch -f db/00_all_ddl.sql
-- Sources: 01_schema.sql, 03_logic_status_audit_log.sql, 04_views.sql, 07_application_rules_max5_open_only.sql, 08_close_issue_rule_reject_pending.sql, 09_hybrid_search.sql, 10_login_attempts.sql, 11_filter_indexes.sql, 13_accept_procedure.sql

-- ======================================== 01_schema.sql ========================================
-- DevMatch schema (PostgreSQL 16 + pgvector)
-- Runs automatically on first container start.

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- Users & roles ----------
CREATE TABLE users (
    user_id        SERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL CHECK (role IN ('contributor', 'maintainer', 'admin')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1:1 with users where role = 'contributor'
CREATE TABLE contributors (
    contributor_id    SERIAL PRIMARY KEY,
    user_id           INT NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    display_name      TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
    github_username   TEXT NOT NULL UNIQUE,
    bio               TEXT,
    experience_level  TEXT NOT NULL DEFAULT 'beginner'
                      CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
    profile_embedding vector(768)          -- embedding of bio + skills
);

-- ---------- Skills ----------
CREATE TABLE skills (
    skill_id  SERIAL PRIMARY KEY,
    name      TEXT NOT NULL UNIQUE,
    category  TEXT NOT NULL CHECK (category IN ('language', 'framework', 'database', 'devops', 'domain', 'other'))
);

CREATE TABLE contributor_skills (
    contributor_id  INT NOT NULL REFERENCES contributors(contributor_id) ON DELETE CASCADE,
    skill_id        INT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    proficiency     SMALLINT NOT NULL CHECK (proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (contributor_id, skill_id)
);

-- ---------- Repositories & issues ----------
CREATE TABLE repositories (
    repo_id           SERIAL PRIMARY KEY,
    owner_id          INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,  -- maintainer
    full_name         TEXT NOT NULL UNIQUE,             -- e.g. "vercel/next.js"
    description       TEXT,
    primary_language  TEXT,
    stars             INT NOT NULL DEFAULT 0 CHECK (stars >= 0),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE issues (
    issue_id    SERIAL PRIMARY KEY,
    repo_id     INT NOT NULL REFERENCES repositories(repo_id) ON DELETE CASCADE,
    title       TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 300),
    body        TEXT NOT NULL,
    difficulty  TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'claimed', 'closed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    embedding   vector(768),                            -- embedding of title + body
    search_tsv  tsvector GENERATED ALWAYS AS
                (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) STORED
);

CREATE TABLE issue_skills (
    issue_id  INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    skill_id  INT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, skill_id)
);

-- ---------- Applications (contributor claims an issue) ----------
CREATE TABLE applications (
    application_id  SERIAL PRIMARY KEY,
    issue_id        INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    contributor_id  INT NOT NULL REFERENCES contributors(contributor_id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')),
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (issue_id, contributor_id)
);

-- ---------- Audit log (filled by trigger in 03_logic_status_audit_log.sql) ----------
CREATE TABLE issue_status_log (
    log_id      SERIAL PRIMARY KEY,
    issue_id    INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    old_status  TEXT,
    new_status  TEXT NOT NULL,
    changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Indexes ----------
CREATE INDEX idx_issues_repo          ON issues(repo_id);
CREATE INDEX idx_issues_status        ON issues(status);
CREATE INDEX idx_issues_tsv           ON issues USING gin(search_tsv);                        -- full-text search
CREATE INDEX idx_issues_embedding     ON issues USING hnsw (embedding vector_cosine_ops);     -- semantic search
CREATE INDEX idx_contrib_embedding    ON contributors USING hnsw (profile_embedding vector_cosine_ops);
CREATE INDEX idx_applications_contrib ON applications(contributor_id);


-- ======================================== 03_logic_status_audit_log.sql ========================================
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


-- ======================================== 04_views.sql ========================================
-- DevMatch views (Task 3). Apply on an existing database with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/04_views.sql
-- Safe to re-run: each view is dropped first (CREATE OR REPLACE cannot change a view's columns).
-- Counts are cast to INT because node-postgres returns BIGINT (COUNT) as strings.

-- 1. Open issues with their repository and a comma-separated skill list.
DROP VIEW IF EXISTS v_open_issues;
CREATE VIEW v_open_issues AS
SELECT i.issue_id,
       r.full_name                                   AS repo_name,
       i.title,
       i.difficulty,
       i.created_at,
       COALESCE(string_agg(s.name, ', ' ORDER BY s.name), '') AS skills
FROM issues i
JOIN repositories r         ON r.repo_id = i.repo_id
LEFT JOIN issue_skills isk  ON isk.issue_id = i.issue_id
LEFT JOIN skills s          ON s.skill_id = isk.skill_id
WHERE i.status = 'open'
GROUP BY i.issue_id, r.full_name;

-- 2. Skill demand vs supply. LEFT JOINs keep skills nobody needs / nobody has (count 0).
--    COUNT(DISTINCT ...) avoids double counting because the two LEFT JOINs multiply rows.
DROP VIEW IF EXISTS v_skill_demand;
CREATE VIEW v_skill_demand AS
SELECT s.skill_id,
       s.name                                  AS skill,
       s.category,
       COUNT(DISTINCT oi.issue_id)::int        AS open_issues,
       COUNT(DISTINCT cs.contributor_id)::int  AS contributors
FROM skills s
LEFT JOIN issue_skills isk        ON isk.skill_id = s.skill_id
LEFT JOIN issues oi               ON oi.issue_id = isk.issue_id AND oi.status = 'open'
LEFT JOIN contributor_skills cs   ON cs.skill_id = s.skill_id
GROUP BY s.skill_id;

-- 3. Per-repository issue counts by status. Repos without issues show zeros.
DROP VIEW IF EXISTS v_repo_stats;
CREATE VIEW v_repo_stats AS
SELECT r.repo_id,
       r.full_name,
       r.primary_language,
       COUNT(i.issue_id)::int                              AS total_issues,
       (COUNT(*) FILTER (WHERE i.status = 'open'))::int    AS open_issues,
       (COUNT(*) FILTER (WHERE i.status = 'claimed'))::int AS claimed_issues,
       (COUNT(*) FILTER (WHERE i.status = 'closed'))::int  AS closed_issues
FROM repositories r
LEFT JOIN issues i ON i.repo_id = r.repo_id
GROUP BY r.repo_id;


-- ======================================== 07_application_rules_max5_open_only.sql ========================================
-- Application rules enforced in the database, so no code path can bypass them:
--   1. you can only apply to an issue that is open
--   2. a contributor can have at most 5 pending applications at once
-- Runs on first start (see docker-compose.yml). Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/07_application_rules_max5_open_only.sql

CREATE OR REPLACE FUNCTION enforce_application_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status  TEXT;
    v_pending INT;
BEGIN
    -- Only when an application BECOMES pending: a new row, or re-applying after a withdrawal.
    -- Accept/reject/withdraw updates are not affected.
    IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN

        -- FOR SHARE stops a maintainer from claiming the issue between this check and our commit.
        SELECT status INTO v_status FROM issues WHERE issue_id = NEW.issue_id FOR SHARE;
        IF NOT FOUND THEN
            RETURN NEW;  -- unknown issue: let the foreign key reject it (23503) instead of a misleading message
        END IF;
        IF v_status <> 'open' THEN
            RAISE EXCEPTION 'This issue is not open for applications (status: %)', v_status;
        END IF;

        -- Serialise per contributor so two simultaneous applications cannot both slip under the limit.
        PERFORM pg_advisory_xact_lock(NEW.contributor_id);

        SELECT count(*) INTO v_pending
        FROM applications
        WHERE contributor_id = NEW.contributor_id
          AND status = 'pending'
          AND application_id IS DISTINCT FROM NEW.application_id;

        IF v_pending >= 5 THEN
            RAISE EXCEPTION 'You can have at most 5 pending applications. Withdraw one first.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_rules ON applications;
CREATE TRIGGER trg_application_rules
BEFORE INSERT OR UPDATE OF status ON applications
FOR EACH ROW EXECUTE FUNCTION enforce_application_rules();


-- ======================================== 08_close_issue_rule_reject_pending.sql ========================================
-- When an issue is closed, its still-pending applications can never be answered, so reject them.
-- Runs on first start (see docker-compose.yml). Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/08_close_issue_rule_reject_pending.sql
-- Accepted applications are kept as they are (the work may already have been done).

CREATE OR REPLACE FUNCTION reject_pending_on_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE applications
    SET status = 'rejected'
    WHERE issue_id = NEW.issue_id AND status = 'pending';
    RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pending_on_close ON issues;
CREATE TRIGGER trg_reject_pending_on_close
AFTER UPDATE OF status ON issues
FOR EACH ROW
WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
EXECUTE FUNCTION reject_pending_on_close();


-- ======================================== 09_hybrid_search.sql ========================================
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


-- ======================================== 10_login_attempts.sql ========================================
-- Failed login attempts, used to rate-limit brute-force guessing (5 failures per email per 15 minutes).
-- Only failures are stored; a successful login clears the email's rows.
-- Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/10_login_attempts.sql

CREATE TABLE IF NOT EXISTS login_attempts (
    attempt_id    BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL CHECK (length(email) <= 254),
    attempted_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts (email, attempted_at);


-- ======================================== 11_filter_indexes.sql ========================================
-- Indexes that back the difficulty and skill filters on the feed and search pages.
-- Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/11_filter_indexes.sql

-- "issues needing skill X": the primary key (issue_id, skill_id) cannot serve lookups by skill_id alone.
CREATE INDEX IF NOT EXISTS idx_issue_skills_skill ON issue_skills (skill_id);

-- "open issues of difficulty D"
CREATE INDEX IF NOT EXISTS idx_issues_status_difficulty ON issues (status, difficulty);


-- ======================================== 13_accept_procedure.sql ========================================
-- Stored procedure: accept one application in a single call.
-- A maintainer accepting an applicant must do three things together or not at all:
--   1. mark that application 'accepted'
--   2. reject every other pending application for the same issue
--   3. set the issue to 'claimed'  (trg_issue_status_log then writes the audit row)
-- The issue row is locked first (FOR UPDATE), so two simultaneous accepts cannot both win.
-- Run it with:  CALL accept_application(<application_id>);
-- Safe to re-run. Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/13_accept_procedure.sql

CREATE OR REPLACE PROCEDURE accept_application(p_application_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_issue_id   INT;
    v_app_status TEXT;
    v_issue_stat TEXT;
BEGIN
    SELECT issue_id INTO v_issue_id FROM applications WHERE application_id = p_application_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application % does not exist', p_application_id;
    END IF;

    -- Lock the issue first so concurrent accepts for the same issue run one after the other.
    SELECT status INTO v_issue_stat FROM issues WHERE issue_id = v_issue_id FOR UPDATE;
    IF v_issue_stat <> 'open' THEN
        RAISE EXCEPTION 'Issue % is not open (status: %)', v_issue_id, v_issue_stat;
    END IF;

    SELECT status INTO v_app_status FROM applications WHERE application_id = p_application_id FOR UPDATE;
    IF v_app_status <> 'pending' THEN
        RAISE EXCEPTION 'Application % is not pending (status: %)', p_application_id, v_app_status;
    END IF;

    UPDATE applications SET status = 'accepted' WHERE application_id = p_application_id;

    UPDATE applications SET status = 'rejected'
    WHERE issue_id = v_issue_id AND status = 'pending' AND application_id <> p_application_id;

    UPDATE issues SET status = 'claimed' WHERE issue_id = v_issue_id;
END;
$$;


