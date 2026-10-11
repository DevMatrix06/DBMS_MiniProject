"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

export default function ReviewButtons({ applicationId }: { applicationId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "accept" | "reject") {
    if (action === "accept" && !confirm("Accept this applicant? All other pending applicants will be rejected.")) return;
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
    }
  }

  return (
    <div>
      <button className={`${styles.btn} ${styles.primary}`} onClick={() => act("accept")} disabled={busy}>
        Accept
      </button>{" "}
      <button className={`${styles.btn} ${styles.danger}`} onClick={() => act("reject")} disabled={busy}>
        Reject
      </button>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
