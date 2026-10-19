import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import WithdrawButton from "../_components/WithdrawButton";
import { Arrow, Briefcase, Check, Clock } from "@/components/Icons";

type Row = {
  application_id: number;
  status: "pending" | "accepted" | "rejected" | "withdrawn";
  applied_at: Date;
  title: string;
  repo_name: string;
  issue_status: string;
};

const HINT: Record<Row["status"], string> = {
  pending: "Waiting for the maintainer to review",
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
      <div className="card empty">
        <div className="icon-box">
          <Briefcase size={20} />
        </div>
        <h2>No applications yet</h2>
        <p>Browse your recommended issues and apply to the ones that fit.</p>
        <Link href="/contributor/feed" className="btn btn-primary">
          See recommendations <Arrow size={16} />
        </Link>
      </div>
    );
  }

  const pending = rows.filter((r) => r.status === "pending").length;

  return (
    <>
      <div className="row small muted" style={{ marginBottom: "1rem" }}>
        <span>
          <b style={{ color: "var(--text)" }}>{pending}</b> of 5 pending slots used
        </span>
      </div>
      <div className="card-list">
        {rows.map((a) => (
          <article className="card" key={a.application_id}>
            <div className="card-head">
              <div>
                <div className="repo-line">
                  <span className="avatar">{a.repo_name.charAt(0).toUpperCase()}</span>
                  {a.repo_name}
                </div>
                <div className="card-title">{a.title}</div>
              </div>
              <span className={`badge badge-${a.status}`}>
                {a.status === "pending" && <Clock size={13} />}
                {a.status === "accepted" && <Check size={13} />}
                {a.status}
              </span>
            </div>
            <div className="card-foot">
              <span className="muted small">
                {HINT[a.status]} · applied {new Date(a.applied_at).toLocaleDateString()}
              </span>
              {a.status === "pending" && <WithdrawButton applicationId={a.application_id} />}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default function ApplicationsPage() {
  return (
    <main className="container">
      <div className="page-head">
        <h1>My applications</h1>
        <p>Track the status of every issue you applied to. You can have up to 5 pending at a time.</p>
      </div>
      <Suspense fallback={<p className="muted">Loading...</p>}>
        <Applications />
      </Suspense>
    </main>
  );
}
