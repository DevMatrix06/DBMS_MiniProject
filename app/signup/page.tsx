"use client";

import { useState } from "react";
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
      router.push("/dashboard");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Signup failed");
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 380, margin: "0 auto" }}>
      <h1>Sign up</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
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
        <button type="submit">Create account</button>
        {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      </form>
      <p>
        Have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}
