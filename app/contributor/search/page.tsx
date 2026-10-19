"use client";

import { useState } from "react";
import Link from "next/link";
import ApplyButton from "../_components/ApplyButton";

type Result = {
  issue_id: number;
  title: string;
  repo_name: string;
  difficulty: string;
  score: number;
  in_semantic?: boolean; // hybrid mode only
  in_keyword?: boolean;
};
type Mode = "hybrid" | "semantic" | "keyword";

const EXAMPLES = ["make queries faster", "screen reader support", "run in a container", "handle missing data"];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(query: string, m: typeof mode) {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&mode=${m}`);
      const data = await res.json();
      if (res.status === 401) {
        setError("Please log in to search.");
        setResults(null);
      } else if (!res.ok) {
        setError(data.error ?? "Search failed");
        setResults(null);
      } else {
        setResults(data.results);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <h1>Search issues</h1>
      <p className="muted">
        <b>Hybrid</b> combines <b>semantic</b> search (meaning, via embeddings) with <b>keyword</b> search (exact words,
        PostgreSQL full-text). Switch modes to compare them.
      </p>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) run(q.trim(), mode);
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe what you want to work on" />
        <div className="row">
          <select
            value={mode}
            onChange={(e) => {
              const m = e.target.value as typeof mode;
              setMode(m);
              if (q.trim().length >= 2) run(q.trim(), m);
            }}
            style={{ width: "auto" }}
          >
            <option value="hybrid">Hybrid (keyword + semantic)</option>
            <option value="semantic">Semantic (pgvector)</option>
            <option value="keyword">Keyword (full-text)</option>
          </select>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      <div className="tags" style={{ marginBottom: "1.25rem" }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="tag"
            onClick={() => {
              setQ(ex);
              run(ex, mode);
            }}
          >
            {ex}
          </button>
        ))}
      </div>

      {error && (
        <p className="error">
          {error} {error.includes("log in") && <Link href="/login">Log in</Link>}
        </p>
      )}

      {results && results.length === 0 && (
        <p className="muted">
          No results.{" "}
          {mode === "keyword" && "Keyword search needs the exact words - try the semantic mode."}
        </p>
      )}

      {results?.map((r) => (
        <article className="card" key={r.issue_id}>
          <div className="card-head">
            <span className="card-title">{r.title}</span>
            <span className="score">{mode === "hybrid" ? "" : r.score.toFixed(2)}</span>
          </div>
          <div className="muted">
            {r.repo_name} · <span className={`diff-${r.difficulty}`}>{r.difficulty}</span>
            {mode === "hybrid" && (
              <>
                {" · "}
                {r.in_semantic && <span className="tag tag-match">semantic</span>}{" "}
                {r.in_keyword && <span className="tag tag-match">keyword</span>}
              </>
            )}
          </div>
          <div style={{ marginTop: "0.6rem" }}>
            <ApplyButton issueId={r.issue_id} initialStatus={null} />
          </div>
        </article>
      ))}
    </main>
  );
}
