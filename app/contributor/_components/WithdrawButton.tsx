"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WithdrawButton({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/contributor/applications/${applicationId}/withdraw`, { method: "POST" });
      if (res.ok) router.refresh();
      else setError((await res.json().catch(() => null))?.error ?? "Could not withdraw");
    } catch {
      setError("Cannot reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="row">
      {error && <span className="error small">{error}</span>}
      <button type="button" className="btn-sm" onClick={withdraw} disabled={busy}>
        {busy ? "Withdrawing..." : "Withdraw"}
      </button>
    </span>
  );
}
