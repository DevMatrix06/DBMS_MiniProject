import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ApplyButton from "../_components/ApplyButton";

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
      <div className="card">
        <h2>Complete your profile first</h2>
        <p className="muted">
          Matching needs your bio and skills. <Link href="/contributor/profile">Set up your profile</Link>{" "}
          and your recommended issues will appear here.
        </p>
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
      <p className="muted">
        {page === 1 ? "No open issues to recommend right now." : "No more recommendations."}{" "}
        {page > 1 && <Link href="/contributor/feed">Back to the first page</Link>}
      </p>
    );
  }

  return (
    <>
      {shown.map((m) => (
        <article className="card" key={m.issue_id}>
          <div className="card-head">
            <span className="card-title">{m.title}</span>
            <span className="score">{Math.round(m.similarity * 100)}% match</span>
          </div>
          <div className="muted">
            {m.repo_name} · <span className={`diff-${m.difficulty}`}>{m.difficulty}</span>
          </div>
          <div className="tags">
            {m.skills.map((s) => (
              <span key={s} className={m.matched.includes(s) ? "tag tag-match" : "tag"}>
                {s}
              </span>
            ))}
          </div>
          <details style={{ marginTop: "0.6rem" }}>
            <summary className="muted">Details</summary>
            <p style={{ marginTop: "0.4rem" }}>{m.body}</p>
          </details>
          <div style={{ marginTop: "0.6rem" }}>
            <ApplyButton issueId={m.issue_id} initialStatus={m.application_status} />
          </div>
        </article>
      ))}

      <nav className="row" style={{ justifyContent: "space-between", marginTop: "1rem" }}>
        {page > 1 ? <Link href={`/contributor/feed?page=${page - 1}`}>&larr; Previous</Link> : <span />}
        <span className="muted">Page {page}</span>
        {hasNext ? <Link href={`/contributor/feed?page=${page + 1}`}>Next &rarr;</Link> : <span />}
      </nav>
    </>
  );
}

export default function FeedPage(props: PageProps<"/contributor/feed">) {
  return (
    <main className="container">
      <h1>Recommended for you</h1>
      <p className="muted">
        Open issues ranked by semantic similarity to your profile. Highlighted tags are skills you
        already have.
      </p>
      <Suspense fallback={<p className="muted">Finding matches...</p>}>
        <Feed searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}
