-- Indexes that back the difficulty and skill filters on the feed and search pages.
-- Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/11_filter_indexes.sql

-- "issues needing skill X": the primary key (issue_id, skill_id) cannot serve lookups by skill_id alone.
CREATE INDEX IF NOT EXISTS idx_issue_skills_skill ON issue_skills (skill_id);

-- "open issues of difficulty D"
CREATE INDEX IF NOT EXISTS idx_issues_status_difficulty ON issues (status, difficulty);
