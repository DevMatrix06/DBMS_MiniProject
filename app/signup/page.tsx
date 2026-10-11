"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"contributor" | "maintainer">("contributor");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
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
    } else {
      setError((await res.json()).error ?? "Signup failed");
    }
  }

  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Sign up</h1>
      <form onSubmit={onSubmit} className="form">
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="contributor">I want to contribute to issues</option>
          <option value="maintainer">I maintain repositories</option>
        </select>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password (8+ chars)" minLength={8} required />
        {role === "contributor" && (
          <>
            <input name="displayName" placeholder="Display name" required />
            <input name="githubUsername" placeholder="GitHub username" required />
          </>
        )}
        <button type="submit" className="btn-primary">
          Create account
        </button>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        Have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
