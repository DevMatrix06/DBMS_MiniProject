import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { Arrow, Briefcase, Check, Clock, Layers, Search, Sparkles, User } from "@/components/Icons";

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="card">
      <div className="stat-label">
        {icon} {label}
      </div>
      <div className="stat-num">{value}</div>
    </div>
  );
}

function Action({ href, title, text, icon }: { href: string; title: string; text: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="card card-hover" style={{ color: "inherit", textDecoration: "none", display: "block" }}>
      <div className="icon-box">{icon}</div>
      <div className="row between" style={{ flexWrap: "nowrap" }}>
        <h3>{title}</h3>
        <span style={{ color: "var(--accent)" }}>
          <Arrow size={16} />
        </span>
      </div>
      <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
        {text}
      </p>
    </Link>
  );
}

// Reads the session cookie and the DB, so it must render at request time inside Suspense.
async function Overview() {
  const session = await getSession();
  if (!session) redirect("/login");

  const u = await pool.query("SELECT email, role FROM users WHERE user_id = $1", [session.userId]);
  if (!u.rows[0]) redirect("/login");
  const { email, role } = u.rows[0] as { email: string; role: string };

  if (role === "contributor") {
    const { rows } = await pool.query(
      `SELECT c.display_name,
              c.profile_embedding IS NOT NULL AS ready,
              (SELECT count(*)::int FROM contributor_skills cs WHERE cs.contributor_id = c.contributor_id) AS skills,
              (SELECT count(*)::int FROM applications a WHERE a.contributor_id = c.contributor_id AND a.status = 'pending') AS pending,
              (SELECT count(*)::int FROM applications a WHERE a.contributor_id = c.contributor_id AND a.status = 'accepted') AS accepted
       FROM contributors c WHERE c.user_id = $1`,
      [session.userId]
    );
    const me = rows[0];
    return (
      <>
        <div className="page-head">
          <h1>Hi, {me?.display_name ?? email}</h1>
          <p>{me?.ready ? "Your profile is ready. Here is where you stand." : "Finish your profile to start getting matches."}</p>
        </div>
        <div className="grid-3 stagger" style={{ marginBottom: "1.5rem" }}>
          <Stat label="Skills on profile" value={me?.skills ?? 0} icon={<Layers size={15} />} />
          <Stat label="Pending applications" value={`${me?.pending ?? 0} / 5`} icon={<Clock size={15} />} />
          <Stat label="Accepted" value={me?.accepted ?? 0} icon={<Check size={15} />} />
        </div>
        <div className="grid-2 stagger">
          <Action href="/contributor/feed" title="Recommended issues" text="Open issues ranked by similarity to you." icon={<Sparkles size={20} />} />
          <Action href="/contributor/search" title="Search issues" text="Hybrid, semantic or keyword search." icon={<Search size={20} />} />
          <Action href="/contributor/applications" title="My applications" text="Track every application and its status." icon={<Briefcase size={20} />} />
          <Action href="/contributor/profile" title="Edit profile" text="Update your bio and skills." icon={<User size={20} />} />
        </div>
      </>
    );
  }

  if (role === "maintainer") {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*)::int FROM repositories r WHERE r.owner_id = $1) AS repos,
              (SELECT count(*)::int FROM issues i JOIN repositories r ON r.repo_id = i.repo_id
                 WHERE r.owner_id = $1 AND i.status = 'open') AS open_issues,
              (SELECT count(*)::int FROM applications a JOIN issues i ON i.issue_id = a.issue_id
                 JOIN repositories r ON r.repo_id = i.repo_id
                 WHERE r.owner_id = $1 AND a.status = 'pending') AS to_review`,
      [session.userId]
    );
    const s = rows[0];
    return (
      <>
        <div className="page-head">
          <h1>Maintainer dashboard</h1>
          <p>{email}</p>
        </div>
        <div className="grid-3 stagger" style={{ marginBottom: "1.5rem" }}>
          <Stat label="Repositories" value={s.repos} icon={<Layers size={15} />} />
          <Stat label="Open issues" value={s.open_issues} icon={<Sparkles size={15} />} />
          <Stat label="Applicants to review" value={s.to_review} icon={<Clock size={15} />} />
        </div>
        <div className="grid-3">
          <Action href="/maintainer" title="My repositories" text="Manage issues and review applicants." icon={<Briefcase size={20} />} />
        </div>
      </>
    );
  }

  const { rows } = await pool.query(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM issues WHERE status = 'open') AS open_issues,
            (SELECT count(*)::int FROM applications) AS applications`
  );
  const a = rows[0];
  return (
    <>
      <div className="page-head">
        <h1>Admin dashboard</h1>
        <p>{email}</p>
      </div>
      <div className="grid-3 stagger" style={{ marginBottom: "1.5rem" }}>
        <Stat label="Users" value={a.users} icon={<User size={15} />} />
        <Stat label="Open issues" value={a.open_issues} icon={<Sparkles size={15} />} />
        <Stat label="Applications" value={a.applications} icon={<Briefcase size={15} />} />
      </div>
      <div className="grid-3">
        <Action href="/admin" title="Platform stats" text="Repositories, skill demand and open issues." icon={<Layers size={20} />} />
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <main className="container">
      <Suspense fallback={<p className="muted">Loading...</p>}>
        <Overview />
      </Suspense>
    </main>
  );
}
