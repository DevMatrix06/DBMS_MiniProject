"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

export default function NewRepoForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget); // read before any await
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/maintainer/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: f.get("full_name"),
          description: f.get("description"),
          primary_language: f.get("primary_language"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create repository");
        return;
      }
      router.push("/maintainer");
      router.refresh();
    } catch {
      setError("Network error, try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <label>
        Full name
        <input name="full_name" placeholder="owner/repo" required maxLength={201} />
      </label>
      <label>
        Description
        <textarea name="description" rows={3} maxLength={2000} />
      </label>
      <label>
        Primary language
        <input name="primary_language" placeholder="TypeScript" maxLength={50} />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button className={`${styles.btn} ${styles.primary}`} disabled={busy}>
        {busy ? "Creating..." : "Create repository"}
      </button>
    </form>
  );
}
