import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { OWN_REPOS_SQL } from "@/lib/maintainer";
import styles from "./maintainer.module.css";

type RepoRow = {
  repo_id: number;
  full_name: string;
  description: string | null;
  primary_language: string | null;
  open_issues: number;
};

export default function MaintainerHome() {
  return (
    <Suspense fallback={<p className={styles.muted}>Loading...</p>}>
      <RepoList />
    </Suspense>
  );
}

async function RepoList() {
  const session = await requireRole("maintainer");
  if (!session) redirect("/login");

  const { rows } = await pool.query<RepoRow>(OWN_REPOS_SQL, [session.userId]);

  return (
    <>
      <div className={styles.row}>
        <h1 className={styles.h1}>My repositories</h1>
        <Link className={`${styles.btn} ${styles.primary}`} href="/maintainer/repos/new">
          New repository
        </Link>
      </div>
      {rows.length === 0 && <p className={styles.muted}>No repositories yet. Create your first one.</p>}
      {rows.map((r) => (
        <div key={r.repo_id} className={styles.card}>
          <div className={styles.row}>
            <Link href={`/maintainer/repos/${r.repo_id}`}>
              <strong>{r.full_name}</strong>
            </Link>
            <span className={styles.badge}>{r.open_issues} open</span>
          </div>
          {r.description && <p>{r.description}</p>}
          {r.primary_language && <p className={styles.muted}>{r.primary_language}</p>}
        </div>
      ))}
    </>
  );
}
