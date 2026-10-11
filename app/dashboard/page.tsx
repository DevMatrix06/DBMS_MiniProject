import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import LogoutButton from "./LogoutButton";

// Reads the session cookie and the DB, so it must render at request time inside Suspense.
async function CurrentUser() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { rows } = await pool.query(
    "SELECT email, role FROM users WHERE user_id = $1",
    [session.userId]
  );
  if (!rows[0]) redirect("/login");

  return (
    <>
      <p>
        Signed in as {rows[0].email} ({rows[0].role})
      </p>
      <LogoutButton />
    </>
  );
}

export default function Dashboard() {
  return (
    <main style={{ padding: "2rem", maxWidth: 720, margin: "0 auto" }}>
      <h1>Dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <CurrentUser />
      </Suspense>
    </main>
  );
}
