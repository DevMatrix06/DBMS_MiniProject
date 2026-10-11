"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

export default function CloseIssueButton({ issueId }: { issueId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    if (!confirm("Close this issue?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maintainer/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not close issue");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button className={`${styles.btn} ${styles.danger}`} onClick={close} disabled={busy}>
        Close
      </button>
      {error && <span className={styles.error}> {error}</span>}
    </span>
  );
}
