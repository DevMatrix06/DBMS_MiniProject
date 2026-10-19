"use client";

import { useState } from "react";

// initialStatus: the contributor's current application status for this issue, or null.
export default function ApplyButton({ issueId, initialStatus }: { issueId: number; initialStatus: string | null }) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (status && status !== "withdrawn") {
    return <span className="tag tag-match">Application {status}</span>;
  }

  async function apply() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/contributor/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) setStatus("pending");
      else if (res.status === 409 && String(data?.error).startsWith("You already applied")) setStatus("pending");
      else setError(data?.error ?? `Could not apply (HTTP ${res.status})`);
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row">
      <button type="button" className="btn-primary" onClick={apply} disabled={busy}>
        {busy ? "Applying..." : status === "withdrawn" ? "Apply again" : "Apply"}
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
