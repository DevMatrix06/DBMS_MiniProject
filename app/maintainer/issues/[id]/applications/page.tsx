import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { APPLICANTS_SQL, parseId } from "@/lib/maintainer";
import ReviewButtons from "../../../_components/ReviewButtons";
import styles from "../../../maintainer.module.css";

type Applicant = {
  application_id: number;
  status: string;
  applied_at: Date;
  display_name: string;
  github_username: string;
  experience_level: string;
  match_score: number | null;
  skills: { name: string; proficiency: number }[];
};

export default function ApplicationsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading...</p>}>
      <Applicants params={params} />
    </Suspense>
  );
}

async function Applicants({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) redirect("/login");

  const issueId = parseId((await params).id);
  if (issueId === null) notFound();

  const issue = await pool.query<{ title: string; status: string; repo_id: number; full_name: string }>(
    `SELECT i.title, i.status, r.repo_id, r.full_name
     FROM issues i JOIN repositories r ON r.repo_id = i.repo_id
     WHERE i.issue_id = $1 AND r.owner_id = $2`,
    [issueId, session.userId]
  );
  if (issue.rowCount === 0) notFound();
  const info = issue.rows[0];

  const { rows } = await pool.query<Applicant>(APPLICANTS_SQL, [issueId]);

  return (
    <>
      <p className={styles.muted}>
        <Link href={`/maintainer/repos/${info.repo_id}`}>{info.full_name}</Link> / issue #{issueId}
      </p>
      <h1 className={styles.h1}>
        {info.title} <span className={styles.badge}>{info.status}</span>
      </h1>
      {rows.length === 0 && <p className={styles.muted}>No applicants yet.</p>}
      {rows.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Applicant</th>
              <th>Experience</th>
              <th>Skills</th>
              <th>Match</th>
              <th>Applied</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.application_id}>
                <td>
                  {a.display_name}
                  <br />
                  <span className={styles.muted}>@{a.github_username}</span>
                </td>
                <td>{a.experience_level}</td>
                <td>{a.skills.map((s) => `${s.name} (${s.proficiency}/5)`).join(", ")}</td>
                <td>{a.match_score === null ? "n/a" : `${Math.round(a.match_score * 100)}%`}</td>
                <td>{a.applied_at.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>
                  <span className={styles.badge}>{a.status}</span>
                </td>
                <td>
                  {a.status === "pending" && info.status === "open" && (
                    <ReviewButtons applicationId={a.application_id} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
