-- DevMatch analytics queries (Task 3). Run any of them with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/05_queries.sql
-- Needs db/04_views.sql applied first (Q1 and Q8 use the views).

-- Q1 [JOIN, ORDER BY] Open issues per repository, hardest first, via the view.
--    Shows how a view hides the issue/repo/skill joins.
SELECT repo_name, title, difficulty, skills
FROM v_open_issues
ORDER BY CASE difficulty WHEN 'hard' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         repo_name, title;

-- Q2 [JOIN, GROUP BY, aggregates] How many contributors have each skill and how good they are.
SELECT s.name,
       s.category,
       COUNT(cs.contributor_id)           AS contributors,
       ROUND(AVG(cs.proficiency), 2)      AS avg_proficiency,
       MAX(cs.proficiency)                AS best_proficiency
FROM skills s
JOIN contributor_skills cs ON cs.skill_id = s.skill_id
GROUP BY s.skill_id
ORDER BY contributors DESC, avg_proficiency DESC;

-- Q3 [GROUP BY, HAVING] Skills with MORE open issues than contributors (a talent shortage).
--    HAVING filters after aggregation, which WHERE cannot do.
SELECT s.name,
       COUNT(DISTINCT isk.issue_id)        AS open_issues,
       COUNT(DISTINCT cs.contributor_id)   AS contributors
FROM skills s
JOIN issue_skills isk            ON isk.skill_id = s.skill_id
JOIN issues i                    ON i.issue_id = isk.issue_id AND i.status = 'open'
LEFT JOIN contributor_skills cs  ON cs.skill_id = s.skill_id
GROUP BY s.skill_id
HAVING COUNT(DISTINCT isk.issue_id) > COUNT(DISTINCT cs.contributor_id)
ORDER BY open_issues DESC, s.name;

-- Q4 [NOT EXISTS, correlated subquery] Contributors who have never applied to any issue.
SELECT c.contributor_id, c.display_name, c.github_username, c.experience_level
FROM contributors c
WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.contributor_id = c.contributor_id)
ORDER BY c.display_name;

-- Q5 [subquery, HAVING, aggregate] Repository with the highest share of hard issues.
--    The inner query computes every repo's share; the outer HAVING keeps the maximum.
SELECT r.full_name,
       COUNT(*) FILTER (WHERE i.difficulty = 'hard')                  AS hard_issues,
       COUNT(*)                                                       AS total_issues,
       ROUND(100.0 * COUNT(*) FILTER (WHERE i.difficulty = 'hard') / COUNT(*), 1) AS hard_pct
FROM repositories r
JOIN issues i ON i.repo_id = r.repo_id
GROUP BY r.repo_id
HAVING 1.0 * COUNT(*) FILTER (WHERE i.difficulty = 'hard') / COUNT(*) =
       (SELECT MAX(share)
        FROM (SELECT 1.0 * COUNT(*) FILTER (WHERE difficulty = 'hard') / COUNT(*) AS share
              FROM issues
              GROUP BY repo_id) per_repo);

-- Q6 [scalar subquery in HAVING] Contributors with more skills than the average contributor.
SELECT c.display_name, COUNT(cs.skill_id) AS skill_count
FROM contributors c
JOIN contributor_skills cs ON cs.contributor_id = c.contributor_id
GROUP BY c.contributor_id
HAVING COUNT(cs.skill_id) > (SELECT AVG(n) FROM (SELECT COUNT(*) AS n
                                                 FROM contributor_skills
                                                 GROUP BY contributor_id) t)
ORDER BY skill_count DESC, c.display_name;

-- Q7 [LEFT JOIN ... IS NULL, ORDER BY] Open issues nobody has applied to yet.
SELECT r.full_name, i.title, i.difficulty, i.created_at
FROM issues i
JOIN repositories r        ON r.repo_id = i.repo_id
LEFT JOIN applications a   ON a.issue_id = i.issue_id
WHERE i.status = 'open' AND a.application_id IS NULL
ORDER BY i.created_at;

-- Q8 [view + JOIN + aggregate] Repositories ranked by how much of their backlog is still open.
SELECT full_name,
       total_issues,
       open_issues,
       ROUND(100.0 * open_issues / NULLIF(total_issues, 0), 1) AS open_pct
FROM v_repo_stats
WHERE total_issues > 0
ORDER BY open_pct DESC, total_issues DESC;

-- Q9 [vector search + JOIN] Top 5 open issues semantically closest to contributor 1
--    (cosine similarity from match_issues() in 03_logic_status_audit_log.sql), with the skills each issue needs.
SELECT m.title, m.repo_name, m.difficulty, ROUND(m.similarity::numeric, 3) AS similarity, v.skills
FROM match_issues(1, 5) m
JOIN v_open_issues v ON v.issue_id = m.issue_id
ORDER BY m.similarity DESC;

-- Q10 [GROUP BY on the audit table] Status transitions recorded by the trigger.
SELECT old_status, new_status, COUNT(*) AS times, MAX(changed_at) AS last_change
FROM issue_status_log
GROUP BY old_status, new_status
ORDER BY times DESC;

-- Q11 [WITH RECURSIVE] Issues posted per day for the 14 days up to the newest issue, including days with none.
--     The recursive part builds the calendar one day at a time; LEFT JOIN keeps empty days (count 0).
WITH RECURSIVE days(day) AS (
    SELECT (SELECT max(created_at)::date FROM issues) - 13
    UNION ALL
    SELECT day + 1 FROM days WHERE day < (SELECT max(created_at)::date FROM issues)
)
SELECT d.day, COUNT(i.issue_id) AS issues_posted
FROM days d
LEFT JOIN issues i ON i.created_at::date = d.day
GROUP BY d.day
ORDER BY d.day;

-- Q12 [CTE, LEFT JOIN, COALESCE] Each contributor's workload against the limit of 5 pending applications.
--     Two named CTEs are computed once and then joined; contributors with no applications show 0.
WITH pending AS (
    SELECT contributor_id, COUNT(*) AS pending_apps
    FROM applications
    WHERE status = 'pending'
    GROUP BY contributor_id
), skill_cnt AS (
    SELECT contributor_id, COUNT(*) AS skills
    FROM contributor_skills
    GROUP BY contributor_id
)
SELECT c.display_name,
       c.experience_level,
       COALESCE(sc.skills, 0)       AS skills,
       COALESCE(p.pending_apps, 0)  AS pending_apps,
       5 - COALESCE(p.pending_apps, 0) AS slots_left
FROM contributors c
LEFT JOIN pending p     ON p.contributor_id = c.contributor_id
LEFT JOIN skill_cnt sc  ON sc.contributor_id = c.contributor_id
ORDER BY slots_left, c.display_name;
