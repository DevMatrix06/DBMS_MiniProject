"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

// Two-step delete: the first click arms it, the second confirms. The database cascades to issues,
// skills, applications and status-log rows.
export default function DeleteRepoButton({ repoId, issueCount }: { repoId: number; issueCount: number }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/maintainer/repos/${repoId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/maintainer");
        router.refresh();
        return;
      }
      setError((await res.json().catch(() => null))?.error ?? "Could not delete");
    } catch {
      setError("Cannot reach the server.");
    }
    setBusy(false);
    setArmed(false);
  }

  if (!armed) {
    return (
      <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={() => setArmed(true)}>
        Delete repository
      </button>
    );
  }
  return (
    <span className={styles.row} style={{ gap: "0.5rem" }}>
      <span className={styles.muted}>
        Removes {issueCount} issue{issueCount === 1 ? "" : "s"} and their applications.
      </span>
      <button type="button" className={`${styles.btn} ${styles.danger}`} onClick={remove} disabled={busy}>
        {busy ? "Deleting..." : "Yes, delete"}
      </button>
      <button type="button" className={styles.btn} onClick={() => setArmed(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span className={styles.error}>{error}</span>}
    </span>
  );
}
