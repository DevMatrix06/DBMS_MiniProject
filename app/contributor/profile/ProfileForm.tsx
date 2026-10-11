"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Skill = { skill_id: number; name: string; category: string };
type Pick = { skillId: number; proficiency: number };

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
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    const res = await fetch("/api/contributor/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bio,
        experienceLevel: level,
        skills: [...picked].map(([skillId, proficiency]) => ({ skillId, proficiency })),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Could not save");
    }
  }

  return (
    <form className="form" onSubmit={save}>
      <p>
        <b>{props.displayName}</b>
      </p>

      <label>
        About you
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="What you work on, what you enjoy, what you want to learn (10+ characters)"
          maxLength={1000}
          required
        />
      </label>

      <label>
        Experience level
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="advanced">Advanced</option>
        </select>
      </label>

      <div>
        <h2>Skills (proficiency 1 to 5)</h2>
        <div className="skill-grid">
          {props.allSkills.map((s) => (
            <label className="skill-item" key={s.skill_id}>
              <input type="checkbox" checked={picked.has(s.skill_id)} onChange={() => toggle(s.skill_id)} />
              {s.name}
              {picked.has(s.skill_id) && (
                <select
                  value={picked.get(s.skill_id)}
                  onChange={(e) => setPicked(new Map(picked).set(s.skill_id, Number(e.target.value)))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      </div>

      <div className="row">
        <button type="submit" className="btn-primary" disabled={saving || picked.size === 0}>
          {saving ? "Saving and embedding..." : "Save profile"}
        </button>
        {saved && <span className="success">Saved. Your feed is updated.</span>}
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}
