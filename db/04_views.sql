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
