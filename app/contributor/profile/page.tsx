import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import ProfileForm from "./ProfileForm";

async function Profile() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "contributor") return <p className="muted">Profiles are for contributor accounts.</p>;

  const [c, all] = await Promise.all([
    pool.query(
      `SELECT c.contributor_id, c.display_name, c.bio, c.experience_level
       FROM contributors c WHERE c.user_id = $1`,
      [session.userId]
    ),
    pool.query("SELECT skill_id, name, category FROM skills ORDER BY category, name"),
  ]);
  const me = c.rows[0];
  if (!me) return <p className="muted">Contributor profile not found.</p>;

  const mine = await pool.query(
    "SELECT skill_id, proficiency FROM contributor_skills WHERE contributor_id = $1",
    [me.contributor_id]
  );

  return (
    <ProfileForm
      displayName={me.display_name}
      initialBio={me.bio ?? ""}
      initialLevel={me.experience_level}
      allSkills={all.rows}
      initialSkills={mine.rows.map((r) => ({ skillId: r.skill_id, proficiency: r.proficiency }))}
    />
  );
}

export default function ProfilePage() {
  return (
    <main className="container">
      <div className="page-head">
        <h1>Your profile</h1>
        <p>Your bio and skills become an embedding that is matched against every open issue.</p>
      </div>
      <Suspense fallback={<p className="muted">Loading profile...</p>}>
        <Profile />
      </Suspense>
    </main>
  );
}
