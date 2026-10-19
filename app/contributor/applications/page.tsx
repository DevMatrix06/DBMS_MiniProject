import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import WithdrawButton from "../_components/WithdrawButton";

type Row = {
  application_id: number;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  applied_at: Date;
  title: string;
  repo_name: string;
  issue_status: string;
};

const HINT: Record<Row["status"], string> = {
  pending: "Waiting for the maintainer",
  accepted: "You got it. The issue is yours.",
  rejected: "Not selected this time",
  withdrawn: "You withdrew this application",
};

async function Applications() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "contributor") return <p className="muted">Applications are for contributor accounts.</p>;

  const { rows } = await pool.query<Row>(
    `SELECT a.application_id, a.status, a.applied_at, i.title, i.status AS issue_status, r.full_name AS repo_name
     FROM applications a
     JOIN contributors c ON c.contributor_id = a.contributor_id
     JOIN issues i       ON i.issue_id = a.issue_id
     JOIN repositories r ON r.repo_id = i.repo_id
     WHERE c.user_id = $1
     ORDER BY a.applied_at DESC`,
    [session.userId]
  );

  if (rows.length === 0) {
    return (
      <p className="muted">
        You haven&apos;t applied to anything yet. Browse your <Link href="/contributor/feed">recommended issues</Link>.
      </p>
    );
  }

  return (
    <>
      {rows.map((a) => (
        <article className="card" key={a.application_id}>
          <div className="card-head">
            <span className="card-title">{a.title}</span>
            <span className={a.status === "accepted" ? "score" : "tag"}>{a.status}</span>
          </div>
          <div className="muted">
            {a.repo_name} · applied {new Date(a.applied_at).toLocaleDateString()}
          </div>
          <p className="muted" style={{ margin: "0.4rem 0 0" }}>{HINT[a.status]}</p>
          {a.status === "pending" && (
            <div style={{ marginTop: "0.6rem" }}>
              <WithdrawButton applicationId={a.application_id} />
            </div>
          )}
        </article>
      ))}
    </>
  );
}

export default function ApplicationsPage() {
  return (
    <main className="container">
      <h1>My applications</h1>
      <p className="muted">You can have up to 5 pending applications at a time.</p>
      <Suspense fallback={<p className="muted">Loading...</p>}>
        <Applications />
      </Suspense>
    </main>
  );
}
