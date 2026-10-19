"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Segmented from "@/components/Segmented";

type Role = "contributor" | "maintainer";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("contributor");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          email: f.get("email"),
          password: f.get("password"),
          displayName: f.get("displayName"),
          githubUsername: f.get("githubUsername"),
        }),
      });
      if (res.ok) {
        // New contributors need skills before matching works, so send them to the profile.
        router.push(role === "contributor" ? "/contributor/profile" : "/dashboard");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Signup failed (HTTP ${res.status})`);
    } catch {
      setError("Cannot reach the server. Is the dev server running?");
    }
    setBusy(false);
  }

  return (
    <main className="container container-narrow" style={{ paddingTop: "3rem" }}>
      <div className="card auth-card">
        <h1>Create your account</h1>
        <p className="muted">Pick how you want to use DevMatch.</p>

        <form onSubmit={onSubmit} className="form" style={{ marginTop: "1.25rem" }}>
          <Segmented
            label="Account type"
            fullWidth
            value={role}
            onChange={setRole}
            options={[
              { value: "contributor", label: "Contributor" },
              { value: "maintainer", label: "Maintainer" },
            ]}
          />
          <p className="muted small" style={{ margin: "-0.25rem 0 0" }}>
            {role === "contributor" ? "Find and apply to issues that match your skills." : "List repositories and review applicants."}
          </p>

          <label className="field">
            <span>Email</span>
            <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" placeholder="At least 8 characters" minLength={8} autoComplete="new-password" required />
          </label>
          {role === "contributor" && (
            <>
              <label className="field">
                <span>Display name</span>
                <input name="displayName" placeholder="Ada Lovelace" required />
              </label>
              <label className="field">
                <span>GitHub username</span>
                <input name="githubUsername" placeholder="ada-lovelace" required />
              </label>
            </>
          )}
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary btn-lg" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
      <p className="divider-text">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
