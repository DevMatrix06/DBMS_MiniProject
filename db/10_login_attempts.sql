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
