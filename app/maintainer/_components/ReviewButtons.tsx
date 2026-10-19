"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

export default function ReviewButtons({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false); // accepting rejects everyone else, so ask first
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/maintainer/applications/${applicationId}/${action}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Could not ${action}`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div>
        <p className={styles.muted} style={{ marginBottom: "0.4rem" }}>
          Other pending applicants will be rejected.
        </p>
        <button className={`${styles.btn} ${styles.primary}`} onClick={() => act("accept")} disabled={busy}>
          {busy ? "Accepting..." : "Yes, accept"}
        </button>{" "}
        <button className={styles.btn} onClick={() => setConfirming(false)} disabled={busy}>
          Cancel
        </button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button className={`${styles.btn} ${styles.primary}`} onClick={() => setConfirming(true)} disabled={busy}>
        Accept
      </button>{" "}
      <button className={`${styles.btn} ${styles.danger}`} onClick={() => act("reject")} disabled={busy}>
        Reject
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
