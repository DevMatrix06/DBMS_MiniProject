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

-- ---------- Audit log (filled by trigger in 03_logic.sql) ----------
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
