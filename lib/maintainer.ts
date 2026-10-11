// Shared helpers for the maintainer / application-review features.
// (New file: lib/auth.ts, lib/embeddings.ts and lib/db.ts are owned by Tejas and untouched.)

export type PgError = { code?: string; constraint?: string };

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Parse a positive 32-bit integer id from a URL segment or JSON value. */
export function parseId(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? ""));
  return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null;
}

/** Parse skillIds[]: array of distinct positive ints (max 20). Returns null when invalid. */
export function parseSkillIds(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length > 20) return null;
  const ids: number[] = [];
  for (const x of v) {
    const id = parseId(x);
    if (id === null) return null;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Optional trimmed text: null if absent/blank, false if invalid (not a string or too long). */
export function optionalText(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return false;
  const t = v.trim();
  if (t.length > max) return false;
  return t === "" ? null : t;
}

/** Same text format as scripts/seed.ts, so API-created issues embed like seeded ones. */
export function issueEmbeddingText(title: string, body: string, skillNames: string[]): string {
  return `${title}\n${body}\nSkills: ${skillNames.join(", ")}`;
}

/** A maintainer's own repos with the number of open issues (LEFT JOIN + GROUP BY). */
export const OWN_REPOS_SQL = `
  SELECT r.repo_id, r.full_name, r.description, r.primary_language, r.stars, r.created_at,
         COUNT(i.issue_id) FILTER (WHERE i.status = 'open')::int AS open_issues
  FROM repositories r
  LEFT JOIN issues i ON i.repo_id = r.repo_id
  WHERE r.owner_id = $1
  GROUP BY r.repo_id
  ORDER BY r.created_at DESC`;

/**
 * Applicants of one issue ($1 = issue_id). match_score is the cosine similarity between the
 * contributor profile and the issue embedding (NULL if either vector is missing).
 */
export const APPLICANTS_SQL = `
  SELECT a.application_id, a.status, a.applied_at,
         c.contributor_id, c.display_name, c.github_username, c.experience_level,
         (1 - (i.embedding <=> c.profile_embedding))::float8 AS match_score,
         COALESCE(
           json_agg(json_build_object('name', s.name, 'proficiency', cs.proficiency)
                    ORDER BY cs.proficiency DESC, s.name)
             FILTER (WHERE s.skill_id IS NOT NULL),
           '[]'::json) AS skills
  FROM applications a
  JOIN issues i       ON i.issue_id = a.issue_id
  JOIN contributors c ON c.contributor_id = a.contributor_id
  LEFT JOIN contributor_skills cs ON cs.contributor_id = c.contributor_id
  LEFT JOIN skills s              ON s.skill_id = cs.skill_id
  WHERE a.issue_id = $1
  GROUP BY a.application_id, i.issue_id, c.contributor_id
  ORDER BY match_score DESC NULLS LAST, a.applied_at`;
