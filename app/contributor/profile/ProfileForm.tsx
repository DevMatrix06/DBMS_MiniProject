"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Skill = { skill_id: number; name: string; category: string };
type Pick = { skillId: number; proficiency: number };

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const CATEGORY_LABEL: Record<string, string> = {
  language: "Languages",
  framework: "Frameworks",
  database: "Databases",
  devops: "DevOps",
  domain: "Domains",
  other: "Other",
};

export default function ProfileForm(props: {
  displayName: string;
  initialBio: string;
  initialLevel: string;
  allSkills: Skill[];
  initialSkills: Pick[];
}) {
  const router = useRouter();
  const [bio, setBio] = useState(props.initialBio);
  const [level, setLevel] = useState(props.initialLevel);
  const [picked, setPicked] = useState<Map<number, number>>(
    new Map(props.initialSkills.map((s) => [s.skillId, s.proficiency]))
  );
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function toggle(id: number) {
    const next = new Map(picked);
    if (next.has(id)) next.delete(id);
    else next.set(id, 3);
    setPicked(next);
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/contributor/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio,
          experienceLevel: level,
          skills: [...picked].map(([skillId, proficiency]) => ({ skillId, proficiency })),
        }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError((await res.json().catch(() => null))?.error ?? "Could not save");
      }
    } catch {
      setError("Cannot reach the server. Is the dev server running?");
    }
    setSaving(false);
  }

  // Group skills by category, keeping the order the database returned them in.
  const groups = new Map<string, Skill[]>();
  for (const s of props.allSkills) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <form className="form stagger" onSubmit={save}>
      <section className="card">
        <h2>About you</h2>
        <p className="muted small">
          Hi {props.displayName}. Describe what you work on and what you want to learn. This text is embedded and
          compared with every open issue.
        </p>
        <label className="field" style={{ marginTop: "0.9rem" }}>
          <span>Bio</span>
          <textarea
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              setSaved(false);
            }}
            placeholder="What you work on, what you enjoy, what you want to learn (10+ characters)"
            maxLength={1000}
            required
          />
        </label>
        <div className="field" style={{ marginTop: "1rem" }}>
          <span>Experience level</span>
          <div className="segmented" role="group" aria-label="Experience level" style={{ width: "fit-content" }}>
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => {
                  setLevel(l);
                  setSaved(false);
                }}
              >
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <h2>Skills</h2>
        <p className="muted small">Click a skill to add it, then set how strong you are (1 to 5 dots).</p>
        <div style={{ marginTop: "1rem" }}>
          {[...groups].map(([category, skills]) => (
            <div className="skill-group" key={category}>
              <h3>{CATEGORY_LABEL[category] ?? category}</h3>
              <div className="skill-pills">
                {skills.map((s) => {
                  const prof = picked.get(s.skill_id);
                  const on = prof !== undefined;
                  return (
                    <div className={`skill-pill${on ? " on" : ""}`} key={s.skill_id}>
                      <button type="button" className="pill-name" aria-pressed={on} onClick={() => toggle(s.skill_id)}>
                        {s.name}
                      </button>
                      {on && (
                        <span className="dots" role="group" aria-label={`${s.name} proficiency`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={`dot${n <= prof ? " fill" : ""}`}
                              aria-label={`${n} of 5`}
                              onClick={() => {
                                setPicked(new Map(picked).set(s.skill_id, n));
                                setSaved(false);
                              }}
                            />
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="row between">
        <span className="muted small">{picked.size} skill(s) selected</span>
        <div className="row">
          {saved && <span className="success small">Saved. Your feed is updated.</span>}
          {error && <span className="error small">{error}</span>}
          <button type="submit" className="btn-primary btn-lg" disabled={saving || picked.size === 0}>
            {saving ? "Saving and embedding..." : "Save profile"}
          </button>
        </div>
      </div>
    </form>
  );
}
