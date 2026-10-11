import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { parseId } from "@/lib/maintainer";
import NewIssueForm from "../../../../_components/NewIssueForm";
import styles from "../../../../maintainer.module.css";

export default function NewIssuePage({ params }: { params: Promise<{ repoId: string }> }) {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading...</p>}>
      <NewIssue params={params} />
    </Suspense>
  );
}

async function NewIssue({ params }: { params: Promise<{ repoId: string }> }) {
  const session = await requireRole("maintainer");
  if (!session) redirect("/login");

  const repoId = parseId((await params).repoId);
  if (repoId === null) notFound();

  const repo = await pool.query<{ full_name: string }>(
    "SELECT full_name FROM repositories WHERE repo_id = $1 AND owner_id = $2",
    [repoId, session.userId]
  );
  if (repo.rowCount === 0) notFound();

  const skills = await pool.query<{ skill_id: number; name: string; category: string }>(
    "SELECT skill_id, name, category FROM skills ORDER BY category, name"
  );

  return (
    <>
      <h1 className={styles.h1}>New issue in {repo.rows[0].full_name}</h1>
      <NewIssueForm repoId={repoId} skills={skills.rows} />
    </>
  );
}
