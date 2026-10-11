import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import LogoutButton from "./LogoutButton";

export default async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { rows } = await pool.query(
    "SELECT email, role FROM users WHERE user_id = $1",
    [session.userId]
  );
  if (!rows[0]) redirect("/login");

  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Dashboard</h1>
      <p>
        Signed in as {rows[0].email} ({rows[0].role})
      </p>
      <LogoutButton />
    </main>
  );
}
