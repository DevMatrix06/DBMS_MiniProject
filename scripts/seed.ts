// Usage: npm run seed          (fails if data already exists)
//        npm run seed -- --reset (wipes users/repos/issues first)
//        npm run seed -- --extras (adds the admin and sample applications to an already seeded DB; safe to repeat)
import pg from "pg";
import bcrypt from "bcryptjs";
import { embed, toVectorLiteral } from "../lib/embeddings.ts";
import { admin, claimedExample, contributors, issues, maintainer, repos, sampleApplications, DEMO_PASSWORD } from "./seed-data.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Safe to run more than once: every insert is skipped if it already exists.
async function seedExtras(client: pg.PoolClient, hash: string) {
  await client.query(
    "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') ON CONFLICT (email) DO NOTHING",
    [admin.email, hash]
  );

  const apply = (github: string, title: string) =>
    client.query(
      `INSERT INTO applications (issue_id, contributor_id)
       SELECT i.issue_id, c.contributor_id FROM issues i, contributors c
       WHERE i.title = $2 AND i.status = 'open' AND c.github_username = $1
       ON CONFLICT (issue_id, contributor_id) DO NOTHING`,
      [github, title]
    );

  for (const a of sampleApplications) await apply(a.github, a.issue);

  // Walk one issue through review, like the maintainer screen does.
  const open = await client.query("SELECT issue_id FROM issues WHERE title = $1 AND status = 'open'", [claimedExample.issue]);
  if (open.rows[0]) {
    for (const g of [claimedExample.winner, ...claimedExample.others]) await apply(g, claimedExample.issue);
    const issueId = open.rows[0].issue_id;
    await client.query(
      `UPDATE applications SET status = 'accepted'
       WHERE issue_id = $1 AND contributor_id = (SELECT contributor_id FROM contributors WHERE github_username = $2)`,
      [issueId, claimedExample.winner]
    );
    await client.query("UPDATE applications SET status = 'rejected' WHERE issue_id = $1 AND status = 'pending'", [issueId]);
    await client.query("UPDATE issues SET status = 'claimed' WHERE issue_id = $1", [issueId]); // trigger writes the audit row
  }
}

async function main() {
  if (process.argv.includes("--extras")) {
    // Add the admin and sample applications to a database that is already seeded.
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await seedExtras(client, await bcrypt.hash(DEMO_PASSWORD, 10));
      await client.query("COMMIT");
      console.log(`Extras added. Admin login: ${admin.email} / "${DEMO_PASSWORD}"`);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
      await pool.end();
    }
    return;
  }

  if (process.argv.includes("--reset")) {
    // CASCADE clears contributors, repositories, issues and everything hanging off them; skills stay.
    await pool.query("TRUNCATE users RESTART IDENTITY CASCADE");
    console.log("Reset users/repos/issues.");
  }
  const existing = await pool.query("SELECT count(*)::int AS n FROM users");
  if (existing.rows[0].n > 0) {
    console.error("Database already has users. Run with --reset to start over.");
    process.exit(1);
  }

  const skillRows = await pool.query("SELECT skill_id, name FROM skills");
  const skillId = new Map<string, number>(skillRows.rows.map((r) => [r.name, r.skill_id]));
  const need = (n: string) => {
    const id = skillId.get(n);
    if (!id) throw new Error(`Unknown skill in seed data: ${n}`);
    return id;
  };

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Embed first so a failing API call does not leave half-written data.
  console.log(`Embedding ${issues.length} issues and ${contributors.length} profiles...`);
  const issueVecs: string[] = [];
  for (const i of issues) {
    issueVecs.push(toVectorLiteral(await embed(`${i.title}\n${i.body}\nSkills: ${i.skills.join(", ")}`)));
  }
  const profileVecs: string[] = [];
  for (const c of contributors) {
    profileVecs.push(toVectorLiteral(await embed(`${c.bio}\nSkills: ${c.skills.map((s) => s[0]).join(", ")}`)));
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const m = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'maintainer') RETURNING user_id",
      [maintainer.email, hash]
    );
    const ownerId = m.rows[0].user_id;

    const repoId = new Map<string, number>();
    for (const r of repos) {
      const res = await client.query(
        "INSERT INTO repositories (owner_id, full_name, description, primary_language, stars) VALUES ($1,$2,$3,$4,$5) RETURNING repo_id",
        [ownerId, r.name, r.description, r.language, r.stars]
      );
      repoId.set(r.name, res.rows[0].repo_id);
    }

    for (let k = 0; k < issues.length; k++) {
      const i = issues[k];
      const res = await client.query(
        "INSERT INTO issues (repo_id, title, body, difficulty, embedding) VALUES ($1,$2,$3,$4,$5::vector) RETURNING issue_id",
        [repoId.get(i.repo), i.title, i.body, i.difficulty, issueVecs[k]]
      );
      for (const s of i.skills) {
        await client.query("INSERT INTO issue_skills (issue_id, skill_id) VALUES ($1,$2)", [res.rows[0].issue_id, need(s)]);
      }
    }

    for (let k = 0; k < contributors.length; k++) {
      const c = contributors[k];
      const u = await client.query(
        "INSERT INTO users (email, password_hash, role) VALUES ($1,$2,'contributor') RETURNING user_id",
        [c.email, hash]
      );
      const cr = await client.query(
        "INSERT INTO contributors (user_id, display_name, github_username, bio, experience_level, profile_embedding) VALUES ($1,$2,$3,$4,$5,$6::vector) RETURNING contributor_id",
        [u.rows[0].user_id, c.name, c.github, c.bio, c.level, profileVecs[k]]
      );
      for (const [name, prof] of c.skills) {
        await client.query(
          "INSERT INTO contributor_skills (contributor_id, skill_id, proficiency) VALUES ($1,$2,$3)",
          [cr.rows[0].contributor_id, need(name), prof]
        );
      }
    }

    await seedExtras(client, hash);

    await client.query("COMMIT");
    console.log(`Seeded ${repos.length} repos, ${issues.length} issues, ${contributors.length} contributors.`);
    console.log(`Demo logins (password "${DEMO_PASSWORD}"): ${admin.email}, ${maintainer.email}, or any contributor email`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
