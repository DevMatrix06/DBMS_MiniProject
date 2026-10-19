import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ApplyButton from "../_components/ApplyButton";
import FeedFilters from "../_components/FeedFilters";
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
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// searchParams is a runtime API, so it is only read here, inside the Suspense boundary.
async function Feed({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const page = Math.min(Math.max(Number.parseInt(first(sp.page) ?? "1", 10) || 1, 1), MAX_PAGE);
  const offset = (page - 1) * PAGE_SIZE;
  const rawDifficulty = first(sp.difficulty);
  const difficulty = DIFFICULTIES.find((d) => d === rawDifficulty) ?? null;
  const skill = (first(sp.skill) ?? "").slice(0, 50) || null;

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

  const [skillRows, matches] = await Promise.all([
    pool.query<{ name: string }>("SELECT name FROM skills ORDER BY name"),
    // match_issues() ranks the 500 closest open issues; the filters, ordering and paging are plain SQL on top.
    pool.query<Match>(
      `SELECT m.issue_id, m.title, m.repo_name, m.difficulty, m.similarity, i.body, a.status AS application_status,
              ARRAY(SELECT s.name FROM issue_skills isk
                    JOIN skills s ON s.skill_id = isk.skill_id
                    WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS skills,
              ARRAY(SELECT s.name FROM issue_skills isk
                    JOIN skills s ON s.skill_id = isk.skill_id
                    JOIN contributor_skills cs ON cs.skill_id = s.skill_id AND cs.contributor_id = $1
                    WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS matched
       FROM match_issues($1, 500) m
       JOIN issues i ON i.issue_id = m.issue_id
       LEFT JOIN applications a ON a.issue_id = m.issue_id AND a.contributor_id = $1
       WHERE ($2::text IS NULL OR m.difficulty = $2)
         AND ($3::text IS NULL OR EXISTS (SELECT 1 FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id
                                          WHERE isk.issue_id = m.issue_id AND s.name = $3))
       ORDER BY m.similarity DESC
       OFFSET $4 LIMIT $5`,
      // One row more than a page tells us whether a next page exists.
      [contributor.contributor_id, difficulty, skill, offset, PAGE_SIZE + 1]
    ),
  ]);

  const rows = matches.rows;
  const hasNext = rows.length > PAGE_SIZE;
  const shown = rows.slice(0, PAGE_SIZE);
  const filtered = Boolean(difficulty || skill);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams();
    if (p > 1) qs.set("page", String(p));
    if (difficulty) qs.set("difficulty", difficulty);
    if (skill) qs.set("skill", skill);
    return `/contributor/feed${qs.size ? `?${qs}` : ""}`;
  };

  return (
    <>
      <FeedFilters skills={skillRows.rows.map((s) => s.name)} difficulty={difficulty ?? "any"} skill={skill ?? ""} />

      {shown.length === 0 ? (
        <div className="card empty">
          <div className="icon-box">
            <Sparkles size={20} />
          </div>
          <h2>
            {filtered ? "No issues match these filters" : page === 1 ? "No open issues right now" : "No more recommendations"}
          </h2>
          {filtered ? <p>Try a different difficulty or skill.</p> : page > 1 ? <Link href={pageHref(1)}>Back to the first page</Link> : <p>Check back soon.</p>}
        </div>
      ) : (
        <div className="card-list" key={`${difficulty}-${skill}-${page}`}>
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
      )}

      {(page > 1 || hasNext) && (
        <nav className="pager" aria-label="Pagination">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="btn btn-sm">
              &larr; Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="muted small">Page {page}</span>
          {hasNext ? (
            <Link href={pageHref(page + 1)} className="btn btn-sm">
              Next &rarr;
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
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
