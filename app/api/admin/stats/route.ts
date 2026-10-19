import { requireRole } from "@/lib/auth";
import { getAdminStats } from "@/lib/admin-stats";

// Admin-only analytics, read from the views v_repo_stats, v_skill_demand and v_open_issues.
export async function GET() {
  const session = await requireRole("admin");
  if (!session) return Response.json({ error: "Admins only" }, { status: 403 });

  try {
    return Response.json(await getAdminStats());
  } catch {
    // Most likely cause: db/04_views.sql has not been applied to this database.
    return Response.json({ error: "Could not load stats (are the views from db/04_views.sql applied?)" }, { status: 500 });
  }
}
