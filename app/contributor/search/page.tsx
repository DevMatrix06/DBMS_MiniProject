"use client";

import { useState } from "react";
import Link from "next/link";
import ApplyButton from "../_components/ApplyButton";
import { Search } from "@/components/Icons";
import Segmented from "@/components/Segmented";

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

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "hybrid", label: "Hybrid", hint: "Keyword and meaning combined into one ranking" },
  { id: "semantic", label: "Semantic", hint: "Finds issues by meaning, using pgvector embeddings" },
  { id: "keyword", label: "Keyword", hint: "Exact words only, using PostgreSQL full-text search" },
];
const EXAMPLES = ["make queries faster", "screen reader support", "run in a container", "handle missing data"];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [results, setResults] = useState<Result[] | null>(null);
  const [shownMode, setShownMode] = useState<Mode>("hybrid"); // mode the current results came from
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function run(query: string, m: Mode) {
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
        setShownMode(m);
      }
    } catch {
      setError("Cannot reach the server. Is the dev server running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <div className="page-head">
        <h1>Search issues</h1>
        <p>Describe what you want to work on. Switch modes to see how each search method behaves.</p>
      </div>

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim().length >= 2) run(q.trim(), mode);
        }}
      >
        <div className="searchbar">
          <Search size={18} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. make queries faster"
            aria-label="Search issues"
          />
        </div>
        <div className="row between">
          <Segmented
            label="Search mode"
            value={mode}
            options={MODES.map((m) => ({ value: m.id, label: m.label }))}
            onChange={(m) => {
              setMode(m);
              if (q.trim().length >= 2) run(q.trim(), m);
            }}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          {MODES.find((m) => m.id === mode)?.hint}
        </p>
      </form>

      <div className="tags" style={{ marginBottom: "1.5rem" }}>
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
        <div className="alert" role="alert">
          {error} {error.includes("log in") && <Link href="/login">Log in</Link>}
        </div>
      )}

      {results && results.length === 0 && (
        <div className="card empty">
          <div className="icon-box">
            <Search size={20} />
          </div>
          <h2>No results</h2>
          <p>
            {shownMode === "keyword"
              ? "Keyword search needs the exact words. Try Semantic or Hybrid mode."
              : "Try describing the work in different words."}
          </p>
        </div>
      )}

      <div className="card-list" key={`${shownMode}-${q}-${results?.length ?? 0}`}>
        {results?.map((r) => (
          <article className="card card-hover" key={r.issue_id}>
            <div className="card-head">
              <div>
                <div className="repo-line">
                  <span className="avatar">{r.repo_name.charAt(0).toUpperCase()}</span>
                  {r.repo_name}
                  <span className={`badge badge-${r.difficulty}`}>{r.difficulty}</span>
                </div>
                <div className="card-title">{r.title}</div>
              </div>
              {shownMode !== "hybrid" && (
                <div className="match">
                  <div className="match-num">{r.score.toFixed(2)}</div>
                  <div className="match-label">{shownMode === "semantic" ? "similarity" : "rank"}</div>
                </div>
              )}
            </div>
            <div className="card-foot">
              {shownMode === "hybrid" ? (
                <span className="row">
                  {r.in_semantic && <span className="tag tag-match">semantic</span>}
                  {r.in_keyword && <span className="tag tag-match">keyword</span>}
                </span>
              ) : (
                <span />
              )}
              <ApplyButton issueId={r.issue_id} initialStatus={null} />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
