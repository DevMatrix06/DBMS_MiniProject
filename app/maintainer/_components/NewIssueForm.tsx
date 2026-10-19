"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../maintainer.module.css";

type Skill = { skill_id: number; name: string; category: string };

export default function NewIssueForm({ repoId, skills }: { repoId: number; skills: Skill[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(id: number) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget); // read before any await
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/maintainer/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoId,
          title: f.get("title"),
          body: f.get("body"),
          difficulty: f.get("difficulty"),
          skillIds: selected,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create issue");
        return;
      }
      router.push(`/maintainer/repos/${repoId}`);
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
        Title
        <input name="title" required minLength={5} maxLength={300} />
      </label>
      <label>
        Description
        <textarea name="body" rows={8} required />
      </label>
      <label>
        Difficulty
        <select name="difficulty" defaultValue="medium">
          <option value="easy">easy</option>
          <option value="medium">medium</option>
          <option value="hard">hard</option>
        </select>
      </label>
      <fieldset>
        <legend className={styles.muted}>Required skills</legend>
        <div className={styles.skills}>
          {skills.map((s) => (
            <label key={s.skill_id}>
              <input type="checkbox" checked={selected.includes(s.skill_id)} onChange={() => toggle(s.skill_id)} />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>
      {error && <p className={styles.error}>{error}</p>}
      <button className={`${styles.btn} ${styles.primary}`} disabled={busy}>
        {busy ? "Creating (embedding)..." : "Create issue"}
      </button>
    </form>
  );
}
