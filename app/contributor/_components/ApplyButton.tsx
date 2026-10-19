"use client";

import { useState } from "react";
import { Check, Clock } from "@/components/Icons";

// initialStatus: the contributor's current application status for this issue, or null.
export default function ApplyButton({ issueId, initialStatus }: { issueId: number; initialStatus: string | null }) {
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (status && status !== "withdrawn") {
    return (
      <span className={`badge badge-${status}`} style={{ fontSize: "0.85rem", padding: "0.3rem 0.8rem" }}>
        {status === "pending" ? <Clock size={14} /> : status === "accepted" ? <Check size={14} /> : null}
        Application {status}
      </span>
    );
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
      {error && <span className="error small">{error}</span>}
      <button type="button" className="btn-primary btn-sm" onClick={apply} disabled={busy}>
        {busy ? "Applying..." : status === "withdrawn" ? "Apply again" : "Apply"}
      </button>
    </span>
  );
}
