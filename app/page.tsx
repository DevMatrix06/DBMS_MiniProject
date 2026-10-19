import Link from "next/link";
import { Arrow, Layers, Search, Sparkles, User, Zap } from "@/components/Icons";

export default function Home() {
  return (
    <>
      <main className="container">
        <section className="hero">
          <span className="eyebrow">
            <Sparkles size={14} /> Semantic matching, powered by pgvector
          </span>
          <h1>
            Find the open-source issue that <span className="grad">fits your skills</span>
          </h1>
          <p className="lead">
            DevMatch reads issue descriptions and contributor profiles, turns both into embeddings, and ranks open issues
            by how closely they match what you can actually do.
          </p>
          <div className="row" style={{ justifyContent: "center" }}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Get started <Arrow size={16} />
            </Link>
            <Link href="/login" className="btn btn-lg">
              Log in
            </Link>
          </div>

          {/* A static sample of what a match looks like. */}
          <article className="card preview" aria-label="Example match">
            <div className="card-head">
              <div>
                <div className="repo-line">
                  <span className="avatar">A</span> acme/ledger-api
                  <span className="badge badge-medium">medium</span>
                </div>
                <div className="card-title">Speed up monthly report query</div>
              </div>
              <div className="match">
                <div className="match-num">87%</div>
                <div className="match-label">match</div>
              </div>
            </div>
            <div className="meter">
              <span style={{ width: "87%" }} />
            </div>
            <div className="tags">
              <span className="tag tag-match">PostgreSQL</span>
              <span className="tag tag-match">Python</span>
              <span className="tag">Indexing</span>
            </div>
          </article>
        </section>

        <div className="section-title">
          <h2>How it works</h2>
          <p className="muted">From profile to pull request in three steps.</p>
        </div>
        <section className="steps">
          <div className="card step">
            <div className="icon-box">
              <User size={20} />
            </div>
            <h3>Tell us what you know</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Write a short bio and pick your skills. We turn them into a profile embedding.
            </p>
          </div>
          <div className="card step">
            <div className="icon-box">
              <Sparkles size={20} />
            </div>
            <h3>Get ranked matches</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Open issues are ranked by similarity to you, with the skills you already have highlighted.
            </p>
          </div>
          <div className="card step">
            <div className="icon-box">
              <Zap size={20} />
            </div>
            <h3>Apply and track</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Apply in one click. Maintainers review applicants, and you follow the status.
            </p>
          </div>
        </section>

        <div className="section-title">
          <h2>Built on real database features</h2>
        </div>
        <section className="grid-3">
          <div className="card card-hover">
            <div className="icon-box">
              <Search size={20} />
            </div>
            <h3>Hybrid search</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Keyword full-text search and semantic vector search, fused into one ranking.
            </p>
          </div>
          <div className="card card-hover">
            <div className="icon-box">
              <Layers size={20} />
            </div>
            <h3>Safe by design</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Triggers, constraints and row locks keep applications consistent, even under concurrent requests.
            </p>
          </div>
          <div className="card card-hover">
            <div className="icon-box">
              <User size={20} />
            </div>
            <h3>Three roles</h3>
            <p className="muted small" style={{ marginTop: "0.4rem" }}>
              Contributors, maintainers and admins each get their own tools and access rules.
            </p>
          </div>
        </section>
      </main>
      <footer className="footer">DevMatch · DBMS Level 3 project · PostgreSQL, pgvector and Next.js</footer>
    </>
  );
}
