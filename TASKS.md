# Tanmay's tasks

Tejas has built the base (DB schema, auth, embeddings, matching and search APIs). This file lists what you own.
Work on your own branch and make your own commits, so the history shows individual contribution.

## 0. Get it running (do this first)
1. Clone the repo, install Node 20+ and Docker Desktop (see `README.md`).
2. Copy `.env.example` to `.env`. Set the same password in `POSTGRES_PASSWORD` and `DATABASE_URL`, set any long random `JWT_SECRET`, and put a Gemini key in `EMBEDDING_API_KEY` (free: https://aistudio.google.com/apikey).
3. `docker compose up -d`, then `npm install`, then `npm run seed`, then `npm run dev`.
4. Log in at http://localhost:3000/login as `maintainer@devmatch.dev` / `password123`.
5. Create an admin for testing (signup does not allow admin). Run in a terminal:
   ```
   docker exec -i devmatch-db psql -U devmatch -d devmatch -c "INSERT INTO users (email, password_hash, role) SELECT 'admin@devmatch.dev', password_hash, 'admin' FROM users WHERE email='maintainer@devmatch.dev';"
   ```
6. Git: `git checkout -b tanmay/maintainer-and-analytics`. Use your own git name and email. Keep commits meaningful (about 5 to 10 in total), then open a PR into `main`.

**Next.js note:** this is Next 16 and differs from older versions. Read the relevant file in `node_modules/next/dist/docs/` before writing a page or route. For example, `cookies()` is async and `export const dynamic = ...` is not allowed in route files here.

## Helpers you can use
| Need | Use |
|---|---|
| DB queries | `import { pool } from "@/lib/db"`; always parameterised (`$1`, `$2`), never string concatenation |
| Current user and role | `getSession()`, `requireRole("maintainer")` from `@/lib/auth` (returns `null` when not allowed, so return 403) |
| Embed text | `embed(text)` and `toVectorLiteral(vec)` from `@/lib/embeddings`; insert with `$n::vector` |

Look at `app/api/match/route.ts` and `app/api/auth/signup/route.ts` as examples of the route style (role check, validation, transaction, error codes).

## Task 1: Maintainer features
**Goal:** a maintainer can manage their own repositories and issues.

Pages under `app/maintainer/`, APIs under `app/api/maintainer/`.

- [ ] `POST /api/maintainer/repos` creates a repository (`full_name`, `description`, `primary_language`) with `owner_id` = the session user.
- [ ] `GET /api/maintainer/repos` lists only the caller's repos with an open-issue count (JOIN + GROUP BY).
- [ ] `POST /api/maintainer/issues` creates an issue for a repo the caller owns. Accept `title`, `body`, `difficulty`, and `skillIds[]`. In **one transaction**: embed `title + body + skill names` (same format as `scripts/seed.ts`), insert into `issues` and `issue_skills`.
- [ ] `PATCH /api/maintainer/issues/:id` edits an issue or closes it. Re-embed if title or body changed.
- [ ] Ownership check on every route: a maintainer must get 403 or 404 for another maintainer's repo.
- [ ] Pages: repo list, "new repo" form, issue list per repo, "new issue" form.

**Done when:** a new issue you create appears in `/api/search?mode=semantic` results and in a contributor's `/api/match` feed.

## Task 2: Application review (maintainer side)
Contributors' apply flow is Tejas's task. Until it exists, insert test rows in `applications` with SQL.

- [ ] `GET /api/maintainer/issues/:id/applications` shows applicants (name, skills, experience level, applied_at).
- [ ] `POST /api/maintainer/applications/:id/accept` runs a **transaction** that:
  1. locks the issue row (`SELECT ... FOR UPDATE`),
  2. fails with 409 if the issue is not `open`,
  3. sets this application to `accepted`, all other pending ones for the issue to `rejected`,
  4. sets `issues.status = 'claimed'`.
- [ ] `POST /api/maintainer/applications/:id/reject`.
- [ ] A page to review applicants per issue.

**Done when:** after accept, `SELECT * FROM issue_status_log` shows the `open -> claimed` row written by the existing trigger.

## Task 3: Views, analytics queries and ALTER/DROP demos (SQL)
New files in `db/` (they do not run automatically on an existing volume; apply with
`docker exec -i devmatch-db psql -U devmatch -d devmatch < db/04_views.sql`, or `docker compose down -v` then `up -d` and `npm run seed` to rebuild everything).

- [ ] `db/04_views.sql`:
  - `v_open_issues` (open issues with repo name, difficulty, skill list via `string_agg`)
  - `v_skill_demand` (skill, number of open issues needing it, number of contributors having it; LEFT JOINs)
  - `v_repo_stats` (per repo: total, open, claimed, closed issues)
- [ ] `db/05_queries.sql`: at least 6 documented queries covering JOIN, GROUP BY, HAVING, ORDER BY, aggregates and a subquery. Examples: skills with more open issues than contributors (HAVING), contributors with no applications (NOT EXISTS), repo with the highest share of hard issues (subquery).
- [ ] `db/06_alter_demo.sql`: a short, commented demo of `ALTER TABLE` (for example add `issues.estimated_hours INT CHECK (estimated_hours > 0)`), adding a constraint or index, and `DROP` of something you created for the demo.
- [ ] `GET /api/admin/stats` (admin only, `requireRole("admin")`) returning data from the views, and an `app/admin/page.tsx` dashboard (tables are enough, simple charts optional).

## Task 4: Documentation (soft copy, goes in `docs/`)
Follow the checklist from the project requirements, section 13.

- [ ] ER diagram (draw.io or dbdiagram.io), export as PNG into `docs/`. Entities and relationships can be read from `db/01_schema.sql`.
- [ ] Relational schema (tables, PK, FK, constraints) and data dictionary (one table per entity: column, type, constraint, meaning).
- [ ] Database choice and justification: why PostgreSQL for relational data, why pgvector for semantic matching (one DB, filters plus vector in one query).
- [ ] Vector section: what is embedded (issue title and body, contributor bio and skills), model (Gemini `gemini-embedding-001`, 768 dims), storage (`vector(768)`), metric (cosine, HNSW index), retrieval (`match_issues()` and `/api/search`).
- [ ] Important queries (copy from `db/05_queries.sql` with a one-line explanation each).
- [ ] System architecture diagram, screenshots, testing results, conclusion. Leave the test results table for Tejas to fill once tests exist.

## Do not edit (Tejas owns these, to avoid merge conflicts)
`lib/auth.ts`, `lib/embeddings.ts`, `app/api/match/`, `app/api/search/`, `app/api/auth/`, `app/dashboard/`, `scripts/`, and anything under `app/contributor/` and `app/api/contributor/`.
If you need a change in one of these, ask first.

## Rules
- No secrets in code or commits (`.env` is git-ignored; keep it that way).
- Validate input in the route **and** rely on DB constraints; return 400 for bad input, 403 for wrong role, 404 for missing, 409 for conflicts.
- Run `npm run lint` and `npx tsc --noEmit` before pushing.
