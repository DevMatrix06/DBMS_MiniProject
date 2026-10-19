"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Segmented from "@/components/Segmented";

type Difficulty = "any" | "easy" | "medium" | "hard";

// Filter bar for the recommended feed. State lives in the URL (?difficulty=&skill=) so the page stays
// server-rendered, shareable and works with the browser back button.
export default function FeedFilters({
  skills,
  difficulty,
  skill,
}: {
  skills: string[];
  difficulty: Difficulty;
  skill: string;
}) {
  const router = useRouter();

  function go(next: { difficulty?: Difficulty; skill?: string }) {
    const d = next.difficulty ?? difficulty;
    const s = next.skill ?? skill;
    const qs = new URLSearchParams();
    if (d !== "any") qs.set("difficulty", d);
    if (s) qs.set("skill", s);
    router.push(`/contributor/feed${qs.size ? `?${qs}` : ""}`);
  }

  return (
    <div className="filters">
      <Segmented
        label="Difficulty"
        value={difficulty}
        options={[
          { value: "any", label: "Any" },
          { value: "easy", label: "Easy" },
          { value: "medium", label: "Medium" },
          { value: "hard", label: "Hard" },
        ]}
        onChange={(d) => go({ difficulty: d })}
      />
      <select aria-label="Skill" value={skill} onChange={(e) => go({ skill: e.target.value })}>
        <option value="">Any skill</option>
        {skills.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {(difficulty !== "any" || skill) && (
        <Link href="/contributor/feed" className="clear">
          Clear filters
        </Link>
      )}
    </div>
  );
}
