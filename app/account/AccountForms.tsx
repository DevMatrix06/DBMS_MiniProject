"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ChangePasswordForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: f.get("currentPassword"), newPassword: f.get("newPassword") }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMsg({ ok: true, text: "Password updated." });
        form.reset();
      } else {
        setMsg({ ok: false, text: data?.error ?? `Could not update (HTTP ${res.status})` });
      }
    } catch {
      setMsg({ ok: false, text: "Cannot reach the server." });
    }
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <label className="field">
        <span>Current password</span>
        <input name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label className="field">
        <span>New password</span>
        <input name="newPassword" type="password" minLength={8} autoComplete="new-password" placeholder="At least 8 characters" required />
      </label>
      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "alert alert-good" : "alert"}>
          {msg.text}
        </div>
      )}
      <div>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Updating..." : "Update password"}
        </button>
      </div>
    </form>
  );
}

export function DeleteAccountForm({ role }: { role: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: f.get("password") }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError((await res.json().catch(() => null))?.error ?? `Could not delete (HTTP ${res.status})`);
    } catch {
      setError("Cannot reach the server.");
    }
    setBusy(false);
  }

  const what =
    role === "maintainer"
      ? "your repositories, all their issues, and every application to them"
      : "your profile, skills and all your applications";

  if (!armed) {
    return (
      <button type="button" className="btn-danger" onClick={() => setArmed(true)}>
        Delete my account
      </button>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="alert">
        This permanently deletes {what}. It cannot be undone.
      </div>
      <label className="field">
        <span>Type your password to confirm</span>
        <input name="password" type="password" autoComplete="current-password" required autoFocus />
      </label>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button type="submit" className="btn-danger" disabled={busy}>
          {busy ? "Deleting..." : "Permanently delete"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setArmed(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
