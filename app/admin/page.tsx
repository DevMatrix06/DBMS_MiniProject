import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getAdminStats } from "@/lib/admin-stats";

const cell = { textAlign: "left", padding: "0.35rem 0.6rem", borderBottom: "1px solid #8884" } as const;
const table = { width: "100%", borderCollapse: "collapse", fontSize: "0.9rem", marginBottom: "2rem" } as const;

export default function AdminPage() {
  return (
    <main style={{ maxWidth: "64rem", margin: "0 auto", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>Admin dashboard</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Stats />
      </Suspense>
    </main>
  );
}

async function Stats() {
  const session = await requireRole("admin");
  if (!session) redirect("/login");

  const s = await getAdminStats();
  const maxDemand = Math.max(1, ...s.skillDemand.map((d) => Math.max(d.open_issues, d.contributors)));

  return (
    <>
      <p style={{ marginBottom: "1.5rem" }}>
        Users: {s.usersByRole.map((u) => `${u.role} ${u.count}`).join(" | ") || "none"}
        {" - "}Applications: {s.applicationsByStatus.map((a) => `${a.status} ${a.count}`).join(" | ") || "none"}
      </p>

      <h2 style={{ fontWeight: 600, margin: "0 0 0.5rem" }}>Repositories (v_repo_stats)</h2>
      <table style={table}>
        <thead>
          <tr>
            {["Repository", "Language", "Total", "Open", "Claimed", "Closed"].map((h) => (
              <th key={h} style={cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.repoStats.map((r) => (
            <tr key={r.repo_id}>
              <td style={cell}>{r.full_name}</td>
              <td style={cell}>{r.primary_language ?? "-"}</td>
              <td style={cell}>{r.total_issues}</td>
              <td style={cell}>{r.open_issues}</td>
              <td style={cell}>{r.claimed_issues}</td>
              <td style={cell}>{r.closed_issues}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontWeight: 600, margin: "0 0 0.5rem" }}>Skill demand vs supply (v_skill_demand)</h2>
      <table style={table}>
        <thead>
          <tr>
            {["Skill", "Open issues needing it", "Contributors having it"].map((h) => (
              <th key={h} style={cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.skillDemand.map((d) => (
            <tr key={d.skill}>
              <td style={cell}>{d.skill}</td>
              <td style={cell}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ background: "#2563eb", height: "0.6rem", width: `${(d.open_issues / maxDemand) * 10}rem` }} />
                  {d.open_issues}
                </div>
              </td>
              <td style={cell}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ background: "#16a34a", height: "0.6rem", width: `${(d.contributors / maxDemand) * 10}rem` }} />
                  {d.contributors}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontWeight: 600, margin: "0 0 0.5rem" }}>Latest open issues (v_open_issues)</h2>
      <table style={table}>
        <thead>
          <tr>
            {["Repository", "Title", "Difficulty", "Skills"].map((h) => (
              <th key={h} style={cell}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {s.openIssues.map((i) => (
            <tr key={i.issue_id}>
              <td style={cell}>{i.repo_name}</td>
              <td style={cell}>{i.title}</td>
              <td style={cell}>{i.difficulty}</td>
              <td style={cell}>{i.skills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
