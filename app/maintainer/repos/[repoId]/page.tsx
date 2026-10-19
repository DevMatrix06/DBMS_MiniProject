import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseId } from "@/lib/maintainer";
import CloseIssueButton from "../../_components/CloseIssueButton";
import DeleteRepoButton from "../../_components/DeleteRepoButton";
import styles from "../../maintainer.module.css";

type IssueRow = {
  issue_id: number;
  title: string;
  difficulty: string;
  status: string;
  skills: string;
  pending_applications: number;
};

export default function RepoIssuesPage({ params }: { params: Promise<{ repoId: string }> }) {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading...</p>}>
      <RepoIssues params={params} />
    </Suspense>
  );
}

async function RepoIssues({ params }: { params: Promise<{ repoId: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) redirect("/login");

  const repoId = parseId((await params).repoId);
  if (repoId === null) notFound();

  // Ownership check: someone else's repo is a 404.
  const repo = await pool.query<{ full_name: string }>(
    "SELECT full_name FROM repositories WHERE repo_id = $1 AND owner_id = $2",
    [repoId, session.userId]
  );
  if (repo.rowCount === 0) notFound();

  const { rows } = await pool.query<IssueRow>(
    `SELECT i.issue_id, i.title, i.difficulty, i.status,
            COALESCE((SELECT string_agg(s.name, ', ' ORDER BY s.name)
                      FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
                      WHERE isk.issue_id = i.issue_id), '') AS skills,
            (SELECT COUNT(*)::int FROM applications a
             WHERE a.issue_id = i.issue_id AND a.status = 'pending') AS pending_applications
     FROM issues i
     WHERE i.repo_id = $1
     ORDER BY i.created_at DESC`,
    [repoId]
  );

  return (
    <>
      <div className={styles.row}>
        <h1 className={styles.h1}>{repo.rows[0].full_name}</h1>
        <span className={styles.row} style={{ gap: "0.5rem" }}>
          <DeleteRepoButton repoId={repoId} issueCount={rows.length} />
          <Link className={`${styles.btn} ${styles.primary}`} href={`/maintainer/repos/${repoId}/issues/new`}>
            New issue
          </Link>
        </span>
      </div>
      {rows.length === 0 && <p className={styles.muted}>No issues yet.</p>}
      {rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Issue</th>
              <th>Difficulty</th>
              <th>Skills</th>
              <th>Status</th>
              <th>Applicants</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.issue_id}>
                <td>{i.title}</td>
                <td>{i.difficulty}</td>
                <td>{i.skills}</td>
                <td>
                  <span className={styles.badge}>{i.status}</span>
                </td>
                <td>
                  <Link href={`/maintainer/issues/${i.issue_id}/applications`}>
                    Review ({i.pending_applications} pending)
                  </Link>
                </td>
                <td>{i.status !== "closed" && <CloseIssueButton issueId={i.issue_id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
