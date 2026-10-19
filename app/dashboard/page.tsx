import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";

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
      <p className="muted">
        Signed in as {rows[0].email} ({rows[0].role})
      </p>
      {rows[0].role === "contributor" ? (
        <div className="row">
          <Link href="/contributor/feed" className="btn btn-primary">
            Recommended issues
          </Link>
          <Link href="/contributor/search" className="btn">
            Search issues
          </Link>
          <Link href="/contributor/applications" className="btn">
            My applications
          </Link>
          <Link href="/contributor/profile" className="btn">
            Edit profile
          </Link>
        </div>
      ) : (
        <div className="row">
          {rows[0].role === "maintainer" && (
            <Link href="/maintainer" className="btn btn-primary">
              My repositories
            </Link>
          )}
          {rows[0].role === "admin" && (
            <Link href="/admin" className="btn btn-primary">
              Admin stats
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export default function Dashboard() {
  return (
    <main className="container">
      <h1>Dashboard</h1>
      <Suspense fallback={<p className="muted">Loading...</p>}>
        <CurrentUser />
      </Suspense>
    </main>
  );
}
