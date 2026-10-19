// Lists the database objects the app needs, so a database created before a feature was added is
// detected and explained instead of failing with an opaque 500. Used by /api/health and `npm run db:migrate`.
type Queryable = { query: (sql: string) => Promise<{ rows: { obj: string }[] }> };

export const REQUIRED_OBJECTS = [
  "table:users",
  "table:contributors",
  "table:skills",
  "table:contributor_skills",
  "table:repositories",
  "table:issues",
  "table:issue_skills",
  "table:applications",
  "table:issue_status_log",
  "table:login_attempts",
  "table:v_open_issues",
  "table:v_skill_demand",
  "table:v_repo_stats",
  "function:match_issues/2",
  "function:hybrid_search/5",
  "trigger:trg_issue_status_log",
  "trigger:trg_application_rules",
  "trigger:trg_reject_pending_on_close",
  "index:idx_issue_skills_skill",
];

/** Returns the required objects that do not exist in the connected database. */
export async function missingSchemaObjects(db: Queryable): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT 'table:' || table_name AS obj FROM information_schema.tables WHERE table_schema = 'public'
     UNION ALL SELECT 'function:' || p.proname || '/' || p.pronargs
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
     UNION ALL SELECT 'trigger:' || tgname FROM pg_trigger WHERE NOT tgisinternal
     UNION ALL SELECT 'index:' || indexname FROM pg_indexes WHERE schemaname = 'public'`
  );
  const have = new Set(rows.map((r) => r.obj));
  return REQUIRED_OBJECTS.filter((o) => !have.has(o));
}
