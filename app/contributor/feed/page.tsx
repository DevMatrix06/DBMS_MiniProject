import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

type Match = {
  issue_id: number;
  title: string;
  repo_name: string;
  difficulty: "easy" | "medium" | "hard";
  similarity: number;
  skills: string[];
  matched: string[];
};

async function Feed() {
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
    `SELECT m.issue_id, m.title, m.repo_name, m.difficulty, m.similarity,
            ARRAY(SELECT s.name FROM issue_skills isk
                  JOIN skills s ON s.skill_id = isk.skill_id
                  WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS skills,
            ARRAY(SELECT s.name FROM issue_skills isk
                  JOIN skills s ON s.skill_id = isk.skill_id
                  JOIN contributor_skills cs ON cs.skill_id = s.skill_id AND cs.contributor_id = $1
                  WHERE isk.issue_id = m.issue_id ORDER BY s.name) AS matched
     FROM match_issues($1, 12) m`,
    [contributor.contributor_id]
  );

  if (rows.length === 0) return <p className="muted">No open issues to recommend right now.</p>;

  return (
    <>
      {rows.map((m) => (
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
        </article>
      ))}
    </>
  );
}

export default function FeedPage() {
  return (
    <main className="container">
      <h1>Recommended for you</h1>
      <p className="muted">
        Open issues ranked by semantic similarity to your profile. Highlighted tags are skills you
        already have.
      </p>
      <Suspense fallback={<p className="muted">Finding matches...</p>}>
        <Feed />
      </Suspense>
    </main>
  );
}
