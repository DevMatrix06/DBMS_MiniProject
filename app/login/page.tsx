"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
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
  }

  return (
    <main className="container" style={{ maxWidth: 420 }}>
      <h1>Log in</h1>
      <form onSubmit={onSubmit} className="form">
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit" className="btn-primary">
          Log in
        </button>
        {error && <p role="alert" className="error">{error}</p>}
      </form>
      <p className="muted" style={{ marginTop: "1rem" }}>
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </main>
  );
}
