"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        const { role } = await res.json();
        router.push(role === "contributor" ? "/contributor/feed" : "/dashboard");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => null);
      setError(data?.error ?? `Login failed (HTTP ${res.status})`);
    } catch {
      setError("Cannot reach the server. Is the dev server running?");
    }
    setBusy(false);
  }

  return (
    <main className="container container-narrow" style={{ paddingTop: "4rem" }}>
      <div className="card auth-card">
        <h1>Welcome back</h1>
        <p className="muted">Log in to see issues matched to your skills.</p>
        <form onSubmit={onSubmit} className="form" style={{ marginTop: "1.25rem" }}>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" placeholder="Your password" autoComplete="current-password" required />
          </label>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <button type="submit" className="btn-primary btn-lg" disabled={busy}>
            {busy ? "Logging in..." : "Log in"}
          </button>
        </form>
      </div>
      <p className="divider-text">
        New to DevMatch? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
