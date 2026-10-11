import { pool } from "@/lib/db";

// Reads the analytics views from db/04_views.sql plus two small summary queries.
export async function getAdminStats() {
  const [repoStats, skillDemand, openIssues, usersByRole, applicationsByStatus] = await Promise.all([
    pool.query(
      `SELECT repo_id, full_name, primary_language, total_issues, open_issues, claimed_issues, closed_issues
       FROM v_repo_stats ORDER BY total_issues DESC, full_name`
    ),
    pool.query(
      `SELECT skill, category, open_issues, contributors
       FROM v_skill_demand ORDER BY open_issues DESC, contributors DESC, skill`
    ),
    pool.query(
      `SELECT issue_id, repo_name, title, difficulty, skills, created_at
       FROM v_open_issues ORDER BY created_at DESC LIMIT 50`
    ),
    pool.query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM applications GROUP BY status ORDER BY status`),
  ]);

  return {
    repoStats: repoStats.rows as {
      repo_id: number;
      full_name: string;
      primary_language: string | null;
      total_issues: number;
      open_issues: number;
      claimed_issues: number;
      closed_issues: number;
    }[],
    skillDemand: skillDemand.rows as { skill: string; category: string; open_issues: number; contributors: number }[],
    openIssues: openIssues.rows as {
      issue_id: number;
      repo_name: string;
      title: string;
      difficulty: string;
      skills: string;
      created_at: Date;
    }[],
    usersByRole: usersByRole.rows as { role: string; count: number }[],
    applicationsByStatus: applicationsByStatus.rows as { status: string; count: number }[],
  };
}
