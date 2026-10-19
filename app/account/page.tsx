import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { ChangePasswordForm, DeleteAccountForm } from "./AccountForms";

async function Account() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { rows } = await pool.query("SELECT email, role, created_at FROM users WHERE user_id = $1", [session.userId]);
  const me = rows[0] as { email: string; role: string; created_at: Date } | undefined;
  if (!me) redirect("/login");

  return (
    <div className="stack-lg stagger">
      <section className="card">
        <h2>Signed in as</h2>
        <p style={{ margin: 0 }}>
          {me.email} <span className={`badge badge-${me.role === "admin" ? "hard" : "medium"}`}>{me.role}</span>
        </p>
        <p className="muted small" style={{ margin: "0.3rem 0 0" }}>
          Member since {new Date(me.created_at).toLocaleDateString()}
        </p>
      </section>

      <section className="card">
        <h2>Change password</h2>
        <ChangePasswordForm />
      </section>

      {me.role !== "admin" && (
        <section className="card danger-zone">
          <h2>Delete account</h2>
          <p className="muted small">
            Removes your account and everything that belongs to it, using database cascades.
          </p>
          <DeleteAccountForm role={me.role} />
        </section>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <main className="container container-narrow" style={{ maxWidth: 640 }}>
      <div className="page-head">
        <h1>Account</h1>
        <p>Manage your sign-in details and your data.</p>
      </div>
      <Suspense fallback={<p className="muted">Loading...</p>}>
        <Account />
      </Suspense>
    </main>
  );
}
