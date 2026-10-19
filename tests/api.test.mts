// Integration tests: real HTTP calls against the running app + the real database.
//
//   1. docker compose up -d      (database running, schema + seed loaded via npm run seed)
//   2. npm run dev               (app on http://localhost:3000, or set TEST_BASE_URL)
//   3. npm test
//
// Every run creates its own users/repo/issues (tagged with a unique id) and deletes them afterwards.
// A few tests call the Gemini embeddings API (profile save, issue creation, semantic search).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const TAG = Date.now().toString(36);
const PASSWORD = "password123";
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const email = (name: string) => `${name}-${TAG}@test-${TAG}.dev`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

class Client {
  cookie = "";
  async req(method: string, path: string, body?: unknown): Promise<{ status: number; json: Json; headers: Headers }> {
    const res = await fetch(BASE + path, {
      method,
      headers: { "Content-Type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      if (kv.startsWith("devmatch_session=")) this.cookie = kv.endsWith("=") ? "" : kv;
    }
    const text = await res.text();
    let json: Json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, headers: res.headers };
  }
}

async function q<T = Json>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query(sql, params)).rows as T[];
}

async function signup(role: "contributor" | "maintainer", name: string) {
  const c = new Client();
  const r = await c.req("POST", "/api/auth/signup", {
    role,
    email: email(name),
    password: PASSWORD,
    displayName: name,
    githubUsername: `${name}-${TAG}`,
  });
  assert.equal(r.status, 201, `signup ${name}: ${JSON.stringify(r.json)}`);
  const [u] = await q("SELECT user_id FROM users WHERE email = $1", [email(name)]);
  const [ct] = role === "contributor" ? await q("SELECT contributor_id FROM contributors WHERE user_id = $1", [u.user_id]) : [null];
  return { client: c, userId: u.user_id as number, contributorId: (ct?.contributor_id ?? null) as number | null };
}

let m1: Awaited<ReturnType<typeof signup>>;
let m2: Awaited<ReturnType<typeof signup>>;
let c1: Awaited<ReturnType<typeof signup>>;
let c2: Awaited<ReturnType<typeof signup>>;
let c3: Awaited<ReturnType<typeof signup>>;
let c4: Awaited<ReturnType<typeof signup>>;
let repoId: number;
let n = 0;

async function newIssue(status = "open", title?: string): Promise<number> {
  const [row] = await q(
    "INSERT INTO issues (repo_id, title, body, status) VALUES ($1, $2, 'test body text', $3) RETURNING issue_id",
    [repoId, title ?? `Test issue ${TAG} ${++n}`, status]
  );
  return row.issue_id;
}
const appId = async (issueId: number, contributorId: number | null) =>
  (await q("SELECT application_id FROM applications WHERE issue_id = $1 AND contributor_id = $2", [issueId, contributorId]))[0]
    ?.application_id as number;
const issueStatus = async (id: number) => (await q("SELECT status FROM issues WHERE issue_id = $1", [id]))[0].status as string;

before(async () => {
  const h = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(h?.ok, `App not reachable at ${BASE}. Start it with "npm run dev" and make sure the DB is up.`);
  m1 = await signup("maintainer", "maint1");
  m2 = await signup("maintainer", "maint2");
  c1 = await signup("contributor", "contrib1");
  c2 = await signup("contributor", "contrib2");
  c3 = await signup("contributor", "contrib3");
  c4 = await signup("contributor", "contrib4");
  const [r] = await q("INSERT INTO repositories (owner_id, full_name) VALUES ($1, $2) RETURNING repo_id", [m1.userId, `test/repo-${TAG}`]);
  repoId = r.repo_id;
});

after(async () => {
  // Users cascade to contributors, repositories, issues, applications and the status log.
  await q("DELETE FROM login_attempts WHERE email LIKE $1", [`%@test-${TAG}.dev`]);
  await q("DELETE FROM users WHERE email LIKE $1", [`%@test-${TAG}.dev`]);
  await db.end();
});

// ---------------------------------------------------------------- Authentication
test("A1 login works and /me returns the user", async () => {
  const c = new Client();
  const l = await c.req("POST", "/api/auth/login", { email: email("contrib1"), password: PASSWORD });
  assert.equal(l.status, 200);
  const me = await c.req("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.json.user.role, "contributor");
});

test("A2 duplicate email is rejected (409, unique constraint)", async () => {
  const r = await new Client().req("POST", "/api/auth/signup", {
    role: "maintainer", email: email("maint1"), password: PASSWORD,
  });
  assert.equal(r.status, 409);
});

test("A3 short password is rejected (400)", async () => {
  const r = await new Client().req("POST", "/api/auth/signup", { role: "maintainer", email: email("short"), password: "abc" });
  assert.equal(r.status, 400);
});

test("A4 admin role cannot be self-assigned at signup (400)", async () => {
  const r = await new Client().req("POST", "/api/auth/signup", { role: "admin", email: email("sneaky"), password: PASSWORD });
  assert.equal(r.status, 400);
  assert.equal((await q("SELECT 1 FROM users WHERE email = $1", [email("sneaky")])).length, 0);
});

test("A5 malformed email is rejected by the database CHECK (400)", async () => {
  const r = await new Client().req("POST", "/api/auth/signup", { role: "maintainer", email: "not-an-email", password: PASSWORD });
  assert.equal(r.status, 400);
});

test("A6 wrong password gives 401 with a generic message", async () => {
  const r = await new Client().req("POST", "/api/auth/login", { email: email("contrib1"), password: "wrong-password" });
  assert.equal(r.status, 401);
  const unknown = await new Client().req("POST", "/api/auth/login", { email: email("nobody"), password: "wrong-password" });
  assert.equal(unknown.json.error, r.json.error);
});

test("A7 /me without a session is 401, and logout clears the session", async () => {
  assert.equal((await new Client().req("GET", "/api/auth/me")).status, 401);
  const c = new Client();
  await c.req("POST", "/api/auth/login", { email: email("contrib1"), password: PASSWORD });
  await c.req("POST", "/api/auth/logout");
  assert.equal((await c.req("GET", "/api/auth/me")).status, 401);
});

test("A8 login rate limit: 5 failures lock the email for a while, even with the right password (429)", async () => {
  await signup("maintainer", "lockme");
  const c = new Client();
  for (let i = 0; i < 5; i++) {
    const r = await c.req("POST", "/api/auth/login", { email: email("lockme"), password: `wrong-${i}` });
    assert.equal(r.status, 401, `attempt ${i + 1}`);
  }
  const blocked = await c.req("POST", "/api/auth/login", { email: email("lockme"), password: PASSWORD });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);
  // Other accounts are unaffected.
  assert.equal((await new Client().req("POST", "/api/auth/login", { email: email("maint2"), password: PASSWORD })).status, 200);
  // Unknown emails are limited too, so responses never reveal whether an account exists.
  for (let i = 0; i < 5; i++) await c.req("POST", "/api/auth/login", { email: email("ghost"), password: "x" });
  assert.equal((await c.req("POST", "/api/auth/login", { email: email("ghost"), password: "x" })).status, 429);
});

// ---------------------------------------------------------------- Role-based access
test("R1 contributor cannot use maintainer APIs (403)", async () => {
  assert.equal((await c1.client.req("GET", "/api/maintainer/repos")).status, 403);
});

test("R2 maintainer cannot apply to issues (403)", async () => {
  const id = await newIssue();
  assert.equal((await m1.client.req("POST", "/api/contributor/applications", { issueId: id })).status, 403);
});

test("R3 non-admin cannot read admin stats (403); admin can", async () => {
  assert.equal((await m1.client.req("GET", "/api/admin/stats")).status, 403);
  await q("INSERT INTO users (email, password_hash, role) SELECT $1, password_hash, 'admin' FROM users WHERE user_id = $2", [email("admin"), m1.userId]);
  const a = new Client();
  assert.equal((await a.req("POST", "/api/auth/login", { email: email("admin"), password: PASSWORD })).status, 200);
  const stats = await a.req("GET", "/api/admin/stats");
  assert.equal(stats.status, 200);
  assert.ok(Array.isArray(stats.json.repoStats));
});

test("R4 search and match require a session / the right role", async () => {
  assert.equal((await new Client().req("GET", "/api/search?q=queries&mode=semantic")).status, 401);
  assert.equal((await m1.client.req("GET", "/api/match")).status, 403);
});

// ---------------------------------------------------------------- Profile, embeddings, search
test("P1 profile validation rejects a too-short bio (400)", async () => {
  const r = await c1.client.req("PUT", "/api/contributor/profile", {
    bio: "short", experienceLevel: "beginner", skills: [{ skillId: 1, proficiency: 3 }],
  });
  assert.equal(r.status, 400);
});

test("P2 saving a profile stores skills and a 768-dim embedding, and the match feed works", async () => {
  const skills = await q("SELECT skill_id FROM skills WHERE name IN ('Python', 'PostgreSQL', 'Django')");
  assert.equal(skills.length, 3);
  const r = await c1.client.req("PUT", "/api/contributor/profile", {
    bio: "Backend developer who enjoys database performance tuning and API design.",
    experienceLevel: "intermediate",
    skills: skills.map((s) => ({ skillId: s.skill_id, proficiency: 4 })),
  });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const [p] = await q("SELECT vector_dims(profile_embedding) AS dims FROM contributors WHERE contributor_id = $1", [c1.contributorId]);
  assert.equal(p.dims, 768);
  assert.equal((await q("SELECT 1 FROM contributor_skills WHERE contributor_id = $1", [c1.contributorId])).length, 3);

  const m = await c1.client.req("GET", "/api/match?limit=5");
  assert.equal(m.status, 200);
  assert.ok(m.json.matches.length > 0, "expected seeded issues to be matched (run npm run seed)");
  const sims: number[] = m.json.matches.map((x: Json) => x.similarity);
  assert.deepEqual([...sims].sort((a, b) => b - a), sims, "matches must be ordered by similarity");
});

test("S1 semantic search finds results where keyword search finds none", async () => {
  const phrase = encodeURIComponent("make queries faster");
  const sem = await c1.client.req("GET", `/api/search?q=${phrase}&mode=semantic`);
  const kw = await c1.client.req("GET", `/api/search?q=${phrase}&mode=keyword`);
  assert.equal(sem.status, 200);
  assert.equal(kw.status, 200);
  assert.ok(sem.json.results.length > 0);
  assert.ok(sem.json.results.length > kw.json.results.length);
});

test("S2 search rejects a too-short query (400)", async () => {
  assert.equal((await c1.client.req("GET", "/api/search?q=a&mode=semantic")).status, 400);
});

// ---------------------------------------------------------------- Applying to issues
let issueA: number;

test("AP1 apply creates a pending application (201)", async () => {
  issueA = await newIssue();
  const r = await c1.client.req("POST", "/api/contributor/applications", { issueId: issueA });
  assert.equal(r.status, 201);
  assert.equal((await q("SELECT status FROM applications WHERE application_id = $1", [r.json.applicationId]))[0].status, "pending");
});

test("AP2 applying twice is rejected (409)", async () => {
  assert.equal((await c1.client.req("POST", "/api/contributor/applications", { issueId: issueA })).status, 409);
});

test("AP3 another contributor cannot withdraw my application (404)", async () => {
  const id = await appId(issueA, c1.contributorId);
  assert.equal((await c2.client.req("POST", `/api/contributor/applications/${id}/withdraw`)).status, 404);
});

test("AP4 withdraw works, then applying again reactivates the same application", async () => {
  const id = await appId(issueA, c1.contributorId);
  assert.equal((await c1.client.req("POST", `/api/contributor/applications/${id}/withdraw`)).status, 200);
  assert.equal((await c1.client.req("POST", `/api/contributor/applications/${id}/withdraw`)).status, 409); // not pending anymore
  const again = await c1.client.req("POST", "/api/contributor/applications", { issueId: issueA });
  assert.equal(again.status, 201);
  assert.equal(again.json.applicationId, id);
});

test("AP5 applying to a non-existent issue is 404 (foreign key)", async () => {
  assert.equal((await c1.client.req("POST", "/api/contributor/applications", { issueId: 2147483000 })).status, 404);
});

test("AP6 trigger: at most 5 pending applications per contributor", async () => {
  for (let i = 0; i < 5; i++) {
    const r = await c3.client.req("POST", "/api/contributor/applications", { issueId: await newIssue() });
    assert.equal(r.status, 201);
  }
  const sixthIssue = await newIssue();
  const sixth = await c3.client.req("POST", "/api/contributor/applications", { issueId: sixthIssue });
  assert.equal(sixth.status, 409);
  assert.match(sixth.json.error, /at most 5/);

  const [first] = await q("SELECT application_id FROM applications WHERE contributor_id = $1 ORDER BY application_id LIMIT 1", [c3.contributorId]);
  assert.equal((await c3.client.req("POST", `/api/contributor/applications/${first.application_id}/withdraw`)).status, 200);
  assert.equal((await c3.client.req("POST", "/api/contributor/applications", { issueId: sixthIssue })).status, 201);
});

test("AP7 trigger: concurrent applications cannot exceed the limit (advisory lock)", async () => {
  const issues = await Promise.all([1, 2, 3, 4, 5, 6].map(() => newIssue()));
  const results = await Promise.all(issues.map((issueId) => c4.client.req("POST", "/api/contributor/applications", { issueId })));
  const ok = results.filter((r) => r.status === 201).length;
  assert.equal(ok, 5, `statuses: ${results.map((r) => r.status)}`);
  const [cnt] = await q("SELECT count(*)::int AS n FROM applications WHERE contributor_id = $1 AND status = 'pending'", [c4.contributorId]);
  assert.equal(cnt.n, 5);
});

// ---------------------------------------------------------------- Maintainer review flow
test("M1 accepting: non-owner gets 404, owner claims the issue and the rest are rejected", async () => {
  const issue = await newIssue();
  assert.equal((await c1.client.req("POST", "/api/contributor/applications", { issueId: issue })).status, 201);
  assert.equal((await c2.client.req("POST", "/api/contributor/applications", { issueId: issue })).status, 201);
  const winner = await appId(issue, c1.contributorId);
  const loser = await appId(issue, c2.contributorId);

  assert.equal((await m2.client.req("POST", `/api/maintainer/applications/${winner}/accept`)).status, 404);
  assert.equal(await issueStatus(issue), "open");

  const ok = await m1.client.req("POST", `/api/maintainer/applications/${winner}/accept`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.rejectedCount, 1);
  assert.equal(await issueStatus(issue), "claimed");
  assert.equal((await q("SELECT status FROM applications WHERE application_id = $1", [loser]))[0].status, "rejected");

  // Trigger trg_issue_status_log wrote the audit row.
  const log = await q("SELECT old_status, new_status FROM issue_status_log WHERE issue_id = $1", [issue]);
  assert.deepEqual(log, [{ old_status: "open", new_status: "claimed" }]);

  // A second accept is refused, and so is a new application on a claimed issue (trigger).
  assert.equal((await m1.client.req("POST", `/api/maintainer/applications/${winner}/accept`)).status, 409);
  const late = await c3.client.req("POST", "/api/contributor/applications", { issueId: issue });
  assert.equal(late.status, 409);
  assert.match(late.json.error, /not open/);
});

test("M2 concurrent accepts on one issue: exactly one wins (row lock)", async () => {
  const issue = await newIssue();
  await c1.client.req("POST", "/api/contributor/applications", { issueId: issue });
  await c2.client.req("POST", "/api/contributor/applications", { issueId: issue });
  const a = await appId(issue, c1.contributorId);
  const b = await appId(issue, c2.contributorId);
  const res = await Promise.all([
    m1.client.req("POST", `/api/maintainer/applications/${a}/accept`),
    m1.client.req("POST", `/api/maintainer/applications/${b}/accept`),
  ]);
  assert.deepEqual(res.map((r) => r.status).sort(), [200, 409]);
  const accepted = await q("SELECT 1 FROM applications WHERE issue_id = $1 AND status = 'accepted'", [issue]);
  assert.equal(accepted.length, 1);
});

test("M3 maintainer creates an embedded issue; duplicate title is 409; contributor cannot (403)", async () => {
  const skill = (await q("SELECT skill_id FROM skills WHERE name = 'Go'"))[0].skill_id;
  const body = { repoId, title: `Add graceful shutdown ${TAG}`, body: "Drain in-flight jobs on SIGTERM.", difficulty: "medium", skillIds: [skill] };
  const r = await m1.client.req("POST", "/api/maintainer/issues", body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const [e] = await q("SELECT vector_dims(embedding) AS dims FROM issues WHERE issue_id = $1", [r.json.issue.issue_id]);
  assert.equal(e.dims, 768);
  assert.equal((await m1.client.req("POST", "/api/maintainer/issues", { ...body, title: body.title.toUpperCase() })).status, 409);
  assert.equal((await m2.client.req("POST", "/api/maintainer/issues", body)).status, 404); // not their repo
  assert.equal((await c1.client.req("POST", "/api/maintainer/issues", body)).status, 403);
});

test("H1 hybrid search ranks an issue found by BOTH keyword and semantic search first", async () => {
  const r = await c1.client.req("GET", "/api/search?q=graceful%20shutdown&mode=hybrid");
  assert.equal(r.status, 200);
  assert.ok(r.json.results.length > 0);
  const top = r.json.results[0];
  assert.match(top.title, new RegExp(TAG)); // the issue created in M3
  assert.equal(top.in_semantic, true);
  assert.equal(top.in_keyword, true);
  const scores: number[] = r.json.results.map((x: Json) => x.score);
  assert.deepEqual([...scores].sort((a, b) => b - a), scores, "results must be ordered by fused score");
  // A query with no keyword overlap still works through the semantic side.
  const sem = await c1.client.req("GET", "/api/search?q=make%20queries%20faster&mode=hybrid");
  assert.ok(sem.json.results.some((x: Json) => x.in_semantic && !x.in_keyword));
});

test("CL1 closing an issue rejects its pending applications but keeps an accepted one", async () => {
  // Issue with two pending applications, closed through the maintainer API.
  const open = await newIssue();
  await c1.client.req("POST", "/api/contributor/applications", { issueId: open });
  await c2.client.req("POST", "/api/contributor/applications", { issueId: open });
  const closeRes = await m1.client.req("PATCH", `/api/maintainer/issues/${open}`, { status: "closed" });
  assert.equal(closeRes.status, 200, JSON.stringify(closeRes.json));
  const after = await q("SELECT status FROM applications WHERE issue_id = $1", [open]);
  assert.deepEqual(after.map((a) => a.status), ["rejected", "rejected"]);

  // Issue that was claimed first: the accepted application survives the close.
  const claimed = await newIssue();
  await c1.client.req("POST", "/api/contributor/applications", { issueId: claimed });
  const id = await appId(claimed, c1.contributorId);
  assert.equal((await m1.client.req("POST", `/api/maintainer/applications/${id}/accept`)).status, 200);
  assert.equal((await m1.client.req("PATCH", `/api/maintainer/issues/${claimed}`, { status: "closed" })).status, 200);
  assert.equal((await q("SELECT status FROM applications WHERE application_id = $1", [id]))[0].status, "accepted");
  const log = await q("SELECT new_status FROM issue_status_log WHERE issue_id = $1 ORDER BY log_id", [claimed]);
  assert.deepEqual(log.map((l) => l.new_status), ["claimed", "closed"]);
});

// ---------------------------------------------------------------- Filters
test("F1 difficulty and skill filters narrow search results in every mode", async () => {
  for (const mode of ["hybrid", "semantic"]) {
    const easy = await c1.client.req("GET", `/api/search?q=${encodeURIComponent("improve the pipeline")}&mode=${mode}&difficulty=easy`);
    assert.equal(easy.status, 200, `${mode}: ${JSON.stringify(easy.json)}`);
    assert.ok(easy.json.results.length > 0, `${mode}: expected some easy issues`);
    assert.ok(easy.json.results.every((r: Json) => r.difficulty === "easy"), `${mode}: non-easy result leaked through`);
  }
  for (const mode of ["hybrid", "semantic", "keyword"]) {
    const res = await c1.client.req("GET", `/api/search?q=${encodeURIComponent("Go pipeline")}&mode=${mode}&skill=Go`);
    assert.equal(res.status, 200);
    for (const r of res.json.results as Json[]) {
      const has = await q("SELECT 1 FROM issue_skills isk JOIN skills s ON s.skill_id = isk.skill_id WHERE isk.issue_id = $1 AND s.name = 'Go'", [r.issue_id]);
      assert.equal(has.length, 1, `${mode}: issue ${r.issue_id} does not need Go`);
    }
  }
  assert.equal((await c1.client.req("GET", "/api/search?q=pipeline&mode=hybrid&difficulty=extreme")).status, 400);
  const none = await c1.client.req("GET", "/api/search?q=pipeline&mode=semantic&skill=NoSuchSkill");
  assert.deepEqual(none.json.results, []);
});

test("F2 hybrid_search() applies the filters before ranking; /api/skills lists skills", async () => {
  const rows = await q(
    "SELECT h.title, i.difficulty FROM hybrid_search('database query', (SELECT embedding FROM issues WHERE embedding IS NOT NULL LIMIT 1), 10, 'hard', NULL) h JOIN issues i ON i.issue_id = h.issue_id"
  );
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => r.difficulty === "hard"));
  const s = await c1.client.req("GET", "/api/skills");
  assert.equal(s.status, 200);
  assert.ok(s.json.skills.length >= 16);
  assert.equal((await new Client().req("GET", "/api/skills")).status, 401);
});

// ---------------------------------------------------------------- Account: password and deletion
test("PW1 change password: wrong current 403, weak new 400, success then old password stops working", async () => {
  const u = await signup("maintainer", "pwuser");
  assert.equal((await u.client.req("PUT", "/api/account/password", { currentPassword: "nope-nope", newPassword: "brand-new-pass" })).status, 403);
  assert.equal((await u.client.req("PUT", "/api/account/password", { currentPassword: PASSWORD, newPassword: "short" })).status, 400);
  assert.equal((await u.client.req("PUT", "/api/account/password", { currentPassword: PASSWORD, newPassword: PASSWORD })).status, 400);
  assert.equal((await u.client.req("PUT", "/api/account/password", { currentPassword: PASSWORD, newPassword: "brand-new-pass" })).status, 200);
  assert.equal((await new Client().req("POST", "/api/auth/login", { email: email("pwuser"), password: PASSWORD })).status, 401);
  assert.equal((await new Client().req("POST", "/api/auth/login", { email: email("pwuser"), password: "brand-new-pass" })).status, 200);
  assert.equal((await new Client().req("PUT", "/api/account/password", { currentPassword: PASSWORD, newPassword: "whatever-123" })).status, 401);
});

test("DEL1 deleting a contributor account needs the password and cascades to profile, skills, applications", async () => {
  const u = await signup("contributor", "doomed");
  const skill = (await q("SELECT skill_id FROM skills LIMIT 1"))[0].skill_id;
  await q("INSERT INTO contributor_skills (contributor_id, skill_id, proficiency) VALUES ($1, $2, 3)", [u.contributorId, skill]);
  const issue = await newIssue();
  assert.equal((await u.client.req("POST", "/api/contributor/applications", { issueId: issue })).status, 201);

  assert.equal((await u.client.req("DELETE", "/api/account", { password: "wrong-password" })).status, 403);
  assert.equal((await q("SELECT 1 FROM users WHERE user_id = $1", [u.userId])).length, 1, "user must survive a wrong password");
  assert.equal((await new Client().req("DELETE", "/api/account", { password: PASSWORD })).status, 401);

  const ok = await u.client.req("DELETE", "/api/account", { password: PASSWORD });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.removed.applications, 1);
  const checks: [string, string, number | null][] = [
    ["users", "user_id", u.userId],
    ["contributors", "contributor_id", u.contributorId],
    ["contributor_skills", "contributor_id", u.contributorId],
    ["applications", "contributor_id", u.contributorId],
  ];
  for (const [table, col, val] of checks) {
    assert.equal((await q(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [val])).length, 0, `${table} rows should be gone`);
  }
  assert.equal((await u.client.req("GET", "/api/auth/me")).status, 401, "session must be cleared");
  assert.equal((await q("SELECT 1 FROM issues WHERE issue_id = $1", [issue])).length, 1, "the issue itself is not deleted");
});

test("DEL2 deleting a maintainer account removes their repositories, issues and applications, and spares others", async () => {
  const mt = await signup("maintainer", "doomedm");
  const [repo] = await q("INSERT INTO repositories (owner_id, full_name) VALUES ($1, $2) RETURNING repo_id", [mt.userId, `test/doomed-${TAG}`]);
  const [iss] = await q("INSERT INTO issues (repo_id, title, body) VALUES ($1, $2, 'b') RETURNING issue_id", [repo.repo_id, `Doomed issue ${TAG}`]);
  assert.equal((await c2.client.req("POST", "/api/contributor/applications", { issueId: iss.issue_id })).status, 201);

  const ok = await mt.client.req("DELETE", "/api/account", { password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.removed, { applications: 1, repositories: 1 });
  assert.equal((await q("SELECT 1 FROM repositories WHERE repo_id = $1", [repo.repo_id])).length, 0);
  assert.equal((await q("SELECT 1 FROM issues WHERE issue_id = $1", [iss.issue_id])).length, 0);
  assert.equal((await q("SELECT 1 FROM applications WHERE issue_id = $1", [iss.issue_id])).length, 0);
  assert.equal((await q("SELECT 1 FROM contributors WHERE contributor_id = $1", [c2.contributorId])).length, 1, "the applicant account must survive");
});

test("DEL3 admin accounts cannot be deleted through the API (403)", async () => {
  const a = new Client();
  assert.equal((await a.req("POST", "/api/auth/login", { email: email("admin"), password: PASSWORD })).status, 200);
  assert.equal((await a.req("DELETE", "/api/account", { password: PASSWORD })).status, 403);
  assert.equal((await q("SELECT 1 FROM users WHERE email = $1", [email("admin")])).length, 1);
});

test("DEL4 deleting a repository: owner only, cascades to issues and applications", async () => {
  const [repo] = await q("INSERT INTO repositories (owner_id, full_name) VALUES ($1, $2) RETURNING repo_id", [m1.userId, `test/del-${TAG}`]);
  const [iss] = await q("INSERT INTO issues (repo_id, title, body) VALUES ($1, $2, 'b') RETURNING issue_id", [repo.repo_id, `Repo delete issue ${TAG}`]);
  await c1.client.req("POST", "/api/contributor/applications", { issueId: iss.issue_id });

  assert.equal((await m2.client.req("DELETE", `/api/maintainer/repos/${repo.repo_id}`)).status, 404);
  assert.equal((await c1.client.req("DELETE", `/api/maintainer/repos/${repo.repo_id}`)).status, 403);
  assert.equal((await q("SELECT 1 FROM repositories WHERE repo_id = $1", [repo.repo_id])).length, 1);

  const ok = await m1.client.req("DELETE", `/api/maintainer/repos/${repo.repo_id}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.removed, { issues: 1, applications: 1 });
  assert.equal((await q("SELECT 1 FROM issues WHERE issue_id = $1", [iss.issue_id])).length, 0);
  assert.equal((await q("SELECT 1 FROM applications WHERE issue_id = $1", [iss.issue_id])).length, 0);
  assert.equal((await m1.client.req("DELETE", `/api/maintainer/repos/${repo.repo_id}`)).status, 404);
});

// ---------------------------------------------------------------- Database-level integrity
async function sqlError(sql: string, params: unknown[] = []): Promise<string> {
  try {
    await db.query(sql, params);
  } catch (e) {
    return (e as { code?: string }).code ?? "unknown";
  }
  return "no error";
}

test("D1 CHECK constraints reject invalid values (23514)", async () => {
  assert.equal(await sqlError("INSERT INTO issues (repo_id, title, body, difficulty) VALUES ($1, 'Valid title', 'b', 'impossible')", [repoId]), "23514");
  assert.equal(await sqlError("INSERT INTO issues (repo_id, title, body) VALUES ($1, 'abc', 'b')", [repoId]), "23514");
  assert.equal(await sqlError("INSERT INTO contributor_skills (contributor_id, skill_id, proficiency) VALUES ($1, 1, 6)", [c1.contributorId]), "23514");
});

test("D2 foreign keys and unique constraints are enforced (23503 / 23505)", async () => {
  assert.equal(await sqlError("INSERT INTO applications (issue_id, contributor_id) VALUES (2147483000, $1)", [c1.contributorId]), "23503");
  assert.equal(await sqlError("INSERT INTO applications (issue_id, contributor_id) VALUES ($1, $2)", [issueA, c1.contributorId]), "23505");
});

test("D3 trigger blocks applications to a non-open issue even from raw SQL (P0001)", async () => {
  const closed = await newIssue("closed");
  assert.equal(await sqlError("INSERT INTO applications (issue_id, contributor_id) VALUES ($1, $2)", [closed, c2.contributorId]), "P0001");
});

test("D4 views and the match function return data", async () => {
  for (const view of ["v_open_issues", "v_skill_demand", "v_repo_stats"]) {
    assert.ok((await q(`SELECT 1 FROM ${view} LIMIT 1`)).length > 0, `${view} is empty`);
  }
  const rows = await q("SELECT * FROM match_issues($1, 3)", [c1.contributorId]);
  assert.ok(rows.length > 0);
});

test("D5 deleting a user cascades to their contributor profile and applications", async () => {
  const tmp = await signup("contributor", "cascade");
  const issue = await newIssue();
  await tmp.client.req("POST", "/api/contributor/applications", { issueId: issue });
  assert.equal((await q("SELECT 1 FROM applications WHERE contributor_id = $1", [tmp.contributorId])).length, 1);
  await q("DELETE FROM users WHERE user_id = $1", [tmp.userId]);
  assert.equal((await q("SELECT 1 FROM contributors WHERE user_id = $1", [tmp.userId])).length, 0);
  assert.equal((await q("SELECT 1 FROM applications WHERE contributor_id = $1", [tmp.contributorId])).length, 0);
});
