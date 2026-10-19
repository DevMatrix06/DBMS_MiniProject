import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ApplyButton from "../_components/ApplyButton";
import { Arrow, Sparkles, User } from "@/components/Icons";

type Match = {
  issue_id: number;
  title: string;
  repo_name: string;
  difficulty: "easy" | "medium" | "hard";
  similarity: number;
  skills: string[];
  matched: string[];
  body: string;
  application_status: string | null;
};

const PAGE_SIZE = 10;
const MAX_PAGE = 20;

// searchParams is a runtime API, so it is only read here, inside the Suspense boundary.
async function Feed({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.min(Math.max(Number.parseInt(raw ?? "1", 10) || 1, 1), MAX_PAGE);
  const offset = (page - 1) * PAGE_SIZE;

  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "contributor") {
    return <p className="muted">The recommended feed is for contributor accounts.</p>;
  }

  const c = await pool.query(
    "SELECT contributor_id, profile_embedding IS NOT NULL AS has_profile FROM contributors WHERE user_id = $1",
    [session.userId]
  );
  const contributor = c.rows[0];
  if (!contributor) return <p className="muted">Contributor profile not found.</p>;

  if (!contributor.has_profile) {
    return (
      <div className="card empty">
        <div className="icon-box">
          <User size={20} />
        </div>
        <h2>Complete your profile first</h2>
        <p>Matching needs your bio and skills. It takes about a minute.</p>
        <Link href="/contributor/profile" className="btn btn-primary">
          Set up your profile <Arrow size={16} />
        </Link>
      </div>
    );
  }

  const { rows } = await pool.query<Match>(
    `SELECT m.issue_id, m.title, m.repo_name, m.difficulty, m.similarity, i.body, a.status AS application_status,
            ARRAY(SELECT s.name FROM issue_skills isk
                  JOIN skills s ON s.skill_id = isk.skill_id
                  WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS skills,
            ARRAY(SELECT s.name FROM issue_skills isk
                  JOIN skills s ON s.skill_id = isk.skill_id
                  JOIN contributor_skills cs ON cs.skill_id = s.skill_id AND cs.contributor_id = $1
                  WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS matched
     FROM match_issues($1, $2) m
     JOIN issues i ON i.issue_id = m.issue_id
     LEFT JOIN applications a ON a.issue_id = m.issue_id AND a.contributor_id = $1
     ORDER BY m.similarity DESC
     OFFSET $3 LIMIT $4`,
    // Ask for one row more than a page so we know whether a next page exists.
    [contributor.contributor_id, offset + PAGE_SIZE + 1, offset, PAGE_SIZE + 1]
  );

  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);

  if (shown.length === 0) {
    return (
      <div className="card empty">
        <div className="icon-box">
          <Sparkles size={20} />
        </div>
        <h2>{page === 1 ? "No open issues right now" : "No more recommendations"}</h2>
        {page > 1 ? <Link href="/contributor/feed">Back to the first page</Link> : <p>Check back soon.</p>}
      </div>
    );
  }

  return (
    <>
      <div className="card-list">
        {shown.map((m) => {
          const pct = Math.round(m.similarity * 100);
          return (
            <article className="card card-hover" key={m.issue_id}>
              <div className="card-head">
                <div>
                  <div className="repo-line">
                    <span className="avatar">{m.repo_name.charAt(0).toUpperCase()}</span>
                    {m.repo_name}
                    <span className={`badge badge-${m.difficulty}`}>{m.difficulty}</span>
                  </div>
                  <div className="card-title">{m.title}</div>
                </div>
                <div className="match">
                  <div className="match-num">{pct}%</div>
                  <div className="match-label">match</div>
                </div>
              </div>
              <div className="meter" role="img" aria-label={`${pct} percent match`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="tags">
                {m.skills.map((s) => (
                  <span key={s} className={m.matched.includes(s) ? "tag tag-match" : "tag"}>
                    {m.matched.includes(s) && "✓ "}
                    {s}
                  </span>
                ))}
              </div>
              <details className="more">
                <summary>Details</summary>
                <p>{m.body}</p>
              </details>
              <div className="card-foot">
                <span className="muted small">
                  You have {m.matched.length} of {m.skills.length} skill{m.skills.length === 1 ? "" : "s"}
                </span>
                <ApplyButton issueId={m.issue_id} initialStatus={m.application_status} />
              </div>
            </article>
          );
        })}
      </div>

      <nav className="pager" aria-label="Pagination">
        {page > 1 ? (
          <Link href={`/contributor/feed?page=${page - 1}`} className="btn btn-sm">
            &larr; Previous
          </Link>
        ) : (
          <span />
        )}
        <span className="muted small">Page {page}</span>
        {hasNext ? (
          <Link href={`/contributor/feed?page=${page + 1}`} className="btn btn-sm">
            Next &rarr;
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}

export default function FeedPage(props: PageProps<"/contributor/feed">) {
  return (
    <main className="container">
      <div className="page-head">
        <h1>Recommended for you</h1>
        <p>Open issues ranked by semantic similarity to your profile. Skills you already have are highlighted.</p>
      </div>
      <Suspense fallback={<p className="muted">Finding matches...</p>}>
        <Feed searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
