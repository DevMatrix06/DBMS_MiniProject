# Demo script and viva preparation

## 1. Before the demo (do this once, from a clean state)

```
docker compose down -v        # wipes the database volume
docker compose up -d          # builds the schema, triggers, functions, views, indexes
npm install
npm run seed                  # demo data + embeddings (needs EMBEDDING_API_KEY in .env)
npm run dev                   # http://localhost:3000
```

Quick checks: `http://localhost:3000/api/health` shows `"schema":"ok"`; `npm test` shows 40 passing.
Keep Docker Desktop running. Keep a terminal open in the project folder and one `psql` session:

```
docker exec -it devmatch-db psql -U devmatch -d devmatch
```

Demo accounts (all use the password `password123`):

| Role | Email |
|---|---|
| Contributor | `asha@devmatch.dev` (backend, PostgreSQL), `karthik@devmatch.dev` (frontend), `rohan@devmatch.dev` (Go, Docker) |
| Maintainer | `maintainer@devmatch.dev` (owns the six demo repositories) |
| Admin | `admin@devmatch.dev` |

Use two browser windows (or one normal and one private) so a contributor and a maintainer can be logged in together.

## 2. Demo script (about 12 minutes, in the order of the evaluation checklist)

| # | Show | Say | How |
|---|---|---|---|
| 1 | **ER diagram and design** | Nine tables plus `login_attempts`; users split into three roles; M:N links resolved with junction tables; 3NF. | Open `docs/er_diagram.png`, point at `issues` (vector column) and `applications` |
| 2 | **Relational schema** | PK, FK, UNIQUE, CHECK on every table; every FK cascades. | `docs/01_er_diagram_and_schema.md` section 2 and the data dictionary |
| 3 | **Database implementation** | The whole database is built by SQL files that Docker runs on first start. | psql: `\dt`, `\d issues`, `\df match_issues`, `\df hybrid_search`, `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal;` |
| 4 | **Important queries** | JOIN, GROUP BY, HAVING, subqueries, views. | `docker exec -i devmatch-db psql -U devmatch -d devmatch < db/05_queries.sql`, then explain Q3 (HAVING) and Q5 (subquery) |
| 5 | **Contributor flow in the UI** | Profile becomes an embedding; the feed is ranked by cosine similarity; highlighted chips are skills she already has. | Log in as asha: Feed, open "Details", set filters Easy + Python |
| 6 | **Why vectors** | Keyword search cannot do this. | Search "screen reader support": Keyword shows nothing, Semantic finds "Dropdown menu is not keyboard accessible", Hybrid shows which method found each result |
| 7 | **Apply and DB-level rules** | The limit of 5 pending applications and "open issues only" are enforced by a trigger, not just by the app. | Apply to an issue as asha; show the "Application pending" badge; in psql find a claimed issue with `SELECT issue_id FROM issues WHERE status = 'claimed';`, then run `INSERT INTO applications (issue_id, contributor_id) VALUES (<that id>, 1);` and show the trigger error ("This issue is not open for applications") |
| 8 | **Maintainer flow** | Accept is one transaction: lock the issue, accept one, reject the rest, mark `claimed`. | Window 2: log in as the maintainer, open a repository, Review applicants, Accept |
| 9 | **Audit trigger** | The status change was logged without the app doing anything. | psql: `SELECT * FROM issue_status_log ORDER BY log_id DESC LIMIT 3;` |
| 10 | **Concurrency** | Two accepts at the same time: exactly one wins; six simultaneous applications: exactly five succeed. | Show tests M2 and AP7 in `tests/api.test.mts`, or run `npm test` |
| 11 | **Admin and views** | The dashboard reads three SQL views. | Log in as admin; show `v_skill_demand` in psql |
| 12 | **DELETE with cascade** | One DELETE removes the whole tree. | As a throwaway contributor: Account, Delete my account; then psql: show the rows are gone. Or maintainer: Delete repository |
| 13 | **Database integration and security** | Credentials only in `.env`; passwords hashed with bcrypt; JWT in an httpOnly cookie; roles checked on every API; login rate limit. | Show `.env.example`, `lib/auth.ts`, `lib/db.ts`; try 6 wrong passwords |
| 14 | **Test cases** | 40 integration tests against the real database. | `npm test`, then `docs/03_testing.md` |
| 15 | **Individual contributions** | Commit history shows who did what. | `git shortlog -sne` and the pull request #1 on GitHub |

If something goes wrong live: `/api/health` tells you whether the database and schema are fine; `npm run db:update` repairs an out-of-date database; `npm run seed -- --reset` restores demo data.

## 3. Where each database feature lives (for "show me")

| Feature | File | One-line proof |
|---|---|---|
| CREATE TABLE, keys, CHECK, UNIQUE, indexes | `db/01_schema.sql` | `\d issues` |
| ALTER, DROP | `db/06_alter_demo.sql` | Run it: it adds and removes a column, constraint, index and table inside a rolled-back transaction |
| Views | `db/04_views.sql` | `SELECT * FROM v_skill_demand;` |
| Trigger: audit | `db/03_logic.sql` | Accept an applicant, then `SELECT * FROM issue_status_log;` |
| Trigger: application rules | `db/07_application_rules.sql` | Apply to a claimed issue in psql |
| Trigger: close rule | `db/08_close_issue_rule.sql` | Close an issue that has pending applications; they become `rejected` |
| Function: vector ranking | `db/03_logic.sql` | `SELECT * FROM match_issues(1, 5);` |
| Function: hybrid search | `db/09_hybrid_search.sql` | Search in Hybrid mode; read the function |
| Full-text search | `db/01_schema.sql` (generated `search_tsv`, GIN) | Keyword mode |
| Vector index | `db/01_schema.sql` (HNSW) | `EXPLAIN` on an `ORDER BY embedding <=> ...` query |
| Transactions and locks | `app/api/maintainer/applications/[id]/accept/route.ts` | `BEGIN ... FOR UPDATE ... COMMIT` |
| DELETE with cascade | `app/api/account/route.ts`, `app/api/maintainer/repos/[repoId]/route.ts` | Tests DEL1 to DEL4 |
| Login rate limit | `app/api/auth/login/route.ts`, `db/10_login_attempts.sql` | Six wrong passwords |
| Input validation in the DB | CHECK constraints in `db/01_schema.sql` | Tests D1 to D3 |

## 4. Viva questions and answers

### Design
**Why PostgreSQL and not MongoDB?** The data is relational: fixed attributes, many-to-many links, and integrity rules that matter (one application per contributor per issue, valid status values). A relational database enforces those with constraints and gives transactions and joins. Nothing here is schema-less.

**Why pgvector instead of Pinecone or Qdrant?** Embeddings sit in the same row as the issue, so one query can filter by status, difficulty and skill, join other tables and rank by similarity, in one transaction with one backup. A separate vector store means two systems to keep in sync and merging results in application code.

**What normal form is the schema in?** Third normal form. Skill names exist once in `skills`; many-to-many relations are junction tables; non-key columns depend only on their table's key. The generated `search_tsv` column and the stored embeddings are derived data kept for speed.

**Why does `login_attempts` have no foreign key?** It stores the typed email so attempts for unknown accounts are limited too; otherwise the API's response would reveal which emails exist.

**What is `ON DELETE CASCADE` used for?** So deleting a parent removes its dependants atomically: an account removes its profile, skills and applications; a repository removes its issues and their applications.

### Vector search
**What is embedded and how?** Issues: title, body and skill names. Contributors: bio and skill names. Queries: the typed text. Each is sent to Gemini `gemini-embedding-001`, which returns a 768-number vector; we normalise it to unit length.

**Which similarity metric and why?** Cosine distance (`<=>`). Embeddings encode meaning in direction rather than length, so cosine is the usual choice; similarity shown in the UI is `1 - distance`.

**What index do you use and what does it trade off?** HNSW (`vector_cosine_ops`): an approximate nearest-neighbour graph. It is much faster than scanning every row at large sizes, at the cost of slightly approximate results and slower inserts. With 23 demo issues an exact scan would also be fast; the index shows the production design.

**What is hybrid search?** `hybrid_search()` takes the top 30 issues by full-text rank and the top 30 by vector distance and merges them with Reciprocal Rank Fusion: `1/(60 + rank_semantic) + 1/(60 + rank_keyword)`. Using ranks means the two different score scales never need to be compared. An issue found by both ranks highest.

**Why apply filters before ranking?** If you rank first and filter afterwards, a filter like "hard" could leave you with almost nothing because the top results were all easy. Filtering inside each candidate query keeps the top 30 relevant.

**What happens if the embedding API is down?** Creating or editing an issue or profile returns a clear 502 and writes nothing (the embedding is computed before the transaction). Keyword search and browsing still work.

### SQL and concurrency
**How do you stop two maintainers accepting two applicants for one issue?** The accept API runs one transaction that does `SELECT ... FOR UPDATE` on the issue row. The second request waits, then sees the issue is no longer `open` and gets 409. Test M2 fires both at once.

**How do you enforce "at most 5 pending applications" safely?** A BEFORE trigger counts pending applications. Counting alone is racy, so the trigger first takes `pg_advisory_xact_lock(contributor_id)`; simultaneous requests for one contributor queue up. Test AP7 sends six at once and exactly five succeed.

**Why a trigger instead of checking in the API?** A trigger applies to every code path, including a script or a manual SQL insert (test D3 does exactly that). The API only gives friendlier error messages.

**What does `FOR SHARE` in that trigger do?** It locks the issue row against being claimed between the open-check and the commit of the application.

**Difference between a view and a table?** A view stores a query, not data. The admin dashboard reads three views; they hide the joins and always reflect current data.

**Where do you use GROUP BY with HAVING?** Query Q3: skills with more open issues than contributors, which needs a condition on an aggregate, so HAVING rather than WHERE.

**What is a transaction and where do you use one?** A group of statements that succeed or fail together. Examples: signup (user plus profile), profile save (update, replace skills), accepting an applicant, deleting an account.

### Application and security
**How is authentication done?** Passwords are hashed with bcrypt. On login the server signs a JWT (HS256) and sets it as an httpOnly, SameSite cookie, so scripts in the page cannot read it. `requireRole()` checks the role on every API.

**How is brute force prevented?** After 5 failed logins for an email in 15 minutes the API answers 429 even for the right password. Failures for unknown emails count too.

**Where are secrets kept?** In `.env` (git-ignored); `.env.example` documents the variables. `lib/db.ts` reads `DATABASE_URL` from the environment.

**How do you prevent SQL injection?** Every query uses parameters (`$1`, `$2`); user input is never concatenated into SQL.

**Why does deleting an account ask for the password?** So a stolen session cookie cannot destroy an account. Admins cannot delete themselves through the API, so the platform always keeps an admin.

### Teamwork
**Who did what?** See section 4 of `00_overview.md`. Tejas: schema, triggers and functions, authentication, embeddings and search, contributor side, tests. Tanmay: maintainer pages and APIs, accept and reject transaction, views and analytic queries, ALTER/DROP demo, admin dashboard, ER and design documents. Both worked on the database and the application. Be ready to explain the other person's part too: accept transaction (`accept/route.ts`), views (`db/04_views.sql`), analytic queries (`db/05_queries.sql`).

## 5. Likely live modifications and how to do them

| Request | Steps |
|---|---|
| Add a column to issues and show it | `ALTER TABLE issues ADD COLUMN estimated_hours INT CHECK (estimated_hours > 0);` in psql (also add it to `db/01_schema.sql`); add the field to `NewIssueForm.tsx` and `app/api/maintainer/issues/route.ts` (INSERT); show it in `app/contributor/feed/page.tsx` (SELECT and JSX) |
| Change the pending limit from 5 to 3 | Edit `v_pending >= 5` in `db/07_application_rules.sql`, run `npm run db:migrate`; update the "5" in the UI text |
| Add a new CHECK or constraint | `ALTER TABLE contributors ADD CONSTRAINT bio_len CHECK (bio IS NULL OR length(bio) <= 1000);` then show an insert failing |
| Use a different similarity metric | In SQL replace `<=>` (cosine) with `<->` (Euclidean) or `<#>` (negative inner product) and create the matching index with `vector_l2_ops` or `vector_ip_ops` |
| Prove an index is used | `EXPLAIN ANALYZE SELECT ... FROM issues WHERE status = 'open' AND difficulty = 'easy';` (see `idx_issues_status_difficulty`) |
| New filter on the feed | Add a query-string value in `app/contributor/feed/page.tsx`, a `WHERE` condition in the same query, and a control in `FeedFilters.tsx` |
| A new trigger | Write a function and `CREATE TRIGGER`, for example set `updated_at` on `UPDATE`; test with a manual update in psql |
| A new role | `ALTER TABLE users DROP CONSTRAINT users_role_check, ADD CONSTRAINT users_role_check CHECK (role IN ('contributor','maintainer','admin','reviewer'));` then extend `Role` in `lib/auth.ts` |
| A new analytic query or view | Add it to `db/05_queries.sql` or `db/04_views.sql`, run it with `docker exec -i devmatch-db psql ... < file` |

## 6. Command cheat sheet

| Task | Command |
|---|---|
| Start database | `docker compose up -d` |
| Start app | `npm run dev` |
| Reset demo data | `npm run seed -- --reset` |
| Update an older database | `npm run db:update` |
| Run tests | `npm test` |
| psql shell | `docker exec -it devmatch-db psql -U devmatch -d devmatch` |
| Run a SQL file | `docker exec -i devmatch-db psql -U devmatch -d devmatch < db/05_queries.sql` |
| Contributions | `git shortlog -sne` |
