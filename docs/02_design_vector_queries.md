# DevMatch: database choice, vector search, queries, architecture, screenshots

## 1. Database choice and justification

**Why PostgreSQL (relational).** The data is highly structured and interlinked: users, repositories, issues, skills and applications are connected by foreign keys, and the rules that matter are integrity rules (an issue belongs to exactly one repository, a contributor applies to an issue at most once, status values come from a fixed set). A relational database enforces these with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK constraints, and it gives us transactions (accepting an applicant must change three things atomically), row locks (`SELECT ... FOR UPDATE` prevents two maintainers accepting at once), triggers (the status audit log, the application rules), views, and joins for analytics.

**Why pgvector (instead of a separate vector database).** Semantic matching needs nearest-neighbour search over embeddings, but real queries also need ordinary filters ("only open issues", "only easy issues needing Python", "join the skills"). With the `vector` extension the embeddings live in the same rows as the rest of the data, so one SQL query combines the filter, the join and the vector ranking, in one transaction, with one backup and one connection pool. A separate vector store would force us to keep two systems in sync and to merge results in application code.

**Why not a document (NoSQL) store.** Nothing here is schema-less or deeply nested: every entity has a fixed set of attributes and many-to-many links, which is exactly what relational tables model best. The unstructured part (issue and profile text) is handled by embeddings, not by a document model.

## 2. Vector search

| Aspect | Design |
|---|---|
| What is embedded | Issues: title, body and the names of the required skills (`"<title>\n<body>\nSkills: a, b"`). Contributors: bio and skill names (`"<bio>\nSkills: a, b"`). Search queries: the text typed by the user. |
| Model | Google Gemini `gemini-embedding-001`, called from `lib/embeddings.ts` with task type `SEMANTIC_SIMILARITY` |
| Dimensions | 768 (`outputDimensionality`); vectors are L2-normalised in code because truncated vectors are not unit length |
| Storage | `issues.embedding vector(768)` and `contributors.profile_embedding vector(768)`, in the same rows as the relational columns |
| Metadata stored with the vector | `status`, `difficulty`, `repo_id` and, through `issue_skills`, the required skills. These are used to filter candidates in the same query. |
| Metric | Cosine distance (`<=>`); similarity = `1 - distance` |
| Index | HNSW with `vector_cosine_ops` on both columns (approximate nearest neighbour, fast at larger sizes) |
| When vectors are written | Seed script for demo data; the maintainer API when an issue is created or its title, body or skills are edited; the profile API whenever a contributor saves their profile |
| Retrieval, personal feed | `match_issues(contributor_id, limit)` returns open issues closest to the profile; the feed page adds the difficulty and skill filters, ordering and paging in SQL |
| Retrieval, free text | `/api/search` supports three modes: **semantic** (cosine distance to the query embedding), **keyword** (PostgreSQL full-text search on a generated `tsvector` column with a GIN index) and **hybrid** |
| Hybrid ranking | `hybrid_search()` takes the top 30 issues from each method and fuses their ranks with Reciprocal Rank Fusion, `score = 1/(60 + rank_semantic) + 1/(60 + rank_keyword)`. An issue found by both methods outranks one found by only one, and the two raw score scales (cosine distance and `ts_rank`) never need to be normalised against each other. |
| Filters | Optional difficulty and skill filters are applied **before** ranking, so the top 30 of each method already respect them. They are served by `idx_issues_status_difficulty` and `idx_issue_skills_skill`. |

Why embeddings: a contributor who writes "I like building REST backends in Node" should match an issue titled "Add pagination to the Express API" even though they share no keywords. In the application, searching "screen reader support" finds "Dropdown menu is not keyboard accessible" in semantic mode, while keyword mode returns nothing (screenshots 09 and 10).

## 3. Important queries

The analytic queries are in `db/05_queries.sql` with comments. Views must be applied first (`db/04_views.sql`).

| # | Query | Concepts | What it answers |
|---|---|---|---|
| Q1 | Open issues, hardest first | JOIN (via view), ORDER BY | Backlog overview with skills |
| Q2 | Contributors and average proficiency per skill | JOIN, GROUP BY, AVG, MAX | How strong the community is per skill |
| Q3 | Skills with more open issues than contributors | GROUP BY, HAVING | Where we lack contributors |
| Q4 | Contributors who never applied | NOT EXISTS (correlated subquery) | Who to encourage to apply |
| Q5 | Repository with the highest share of hard issues | Subquery in HAVING, aggregate | Most demanding project |
| Q6 | Contributors with more skills than average | Scalar subquery in HAVING | Most versatile contributors |
| Q7 | Open issues nobody applied to | LEFT JOIN ... IS NULL | Issues needing attention |
| Q8 | Share of each repository's issues still open | View, NULLIF, ROUND | Repository health |
| Q9 | Top 5 semantic matches for contributor 1 | Vector function + JOIN | The matching feature in SQL |
| Q10 | Status transitions from the audit log | GROUP BY on trigger-filled table | Evidence the trigger works |

Queries inside the application:

| Where | Query | Concepts |
|---|---|---|
| Feed page | `match_issues()` joined to issues and the contributor's own application, with `ARRAY(subquery)` for skills and matched skills, filters, `OFFSET`/`LIMIT` | Function, joins, correlated subqueries, pagination |
| `GET /api/search` | Hybrid: `hybrid_search()`; semantic: `ORDER BY embedding <=> $1` with filters; keyword: `websearch_to_tsquery` and `ts_rank` | Vector, full-text, `EXISTS` subquery |
| Dashboards | Per-role counts built from scalar subqueries | Aggregates, subqueries |
| Admin stats | The three views plus `GROUP BY` summaries | Views, GROUP BY |

Other SQL artefacts: `db/04_views.sql` (3 views), `db/06_alter_demo.sql` (ALTER TABLE ADD COLUMN / ADD CONSTRAINT / ALTER COLUMN / RENAME, CREATE INDEX, then DROP TABLE / INDEX / CONSTRAINT / COLUMN; runs in a transaction that is rolled back), and the rule files `db/07` to `db/11`.

## 4. System architecture

![Architecture](architecture.png)

Source: `architecture.dot`.

- **Browser**: contributors, maintainers and admins use pages rendered by Next.js and call JSON APIs with `fetch`. Page changes animate with React `ViewTransition`.
- **Next.js 16 app**: pages are React Server Components; business logic is in Route Handlers under `app/api/`. `lib/auth.ts` issues a JWT in an httpOnly cookie and `requireRole()` guards every API. `lib/db.ts` provides one `pg` connection pool; all SQL is parameterised. Configuration comes from environment variables only.
- **Embedding service**: Gemini API, called only when text is created or changed (issues, profiles) and for semantic and hybrid search queries.
- **PostgreSQL 16 + pgvector in Docker**: tables, constraints, indexes, three triggers, two search functions and the analytics views. The init scripts in `db/` build the whole database on the first start; `npm run db:update` brings an older database up to date.

Key flows:

1. *Create issue*: maintainer submits the form, the API checks ownership, embeds title + body + skills, then inserts the issue and its skills in one transaction.
2. *Match*: contributor opens the feed, the page calls `match_issues()`, which orders open issues by cosine distance to the profile embedding; filters and paging are applied in SQL.
3. *Apply*: the API inserts the application; the trigger `trg_application_rules` refuses it unless the issue is open and the contributor has fewer than 5 pending applications.
4. *Accept applicant*: one transaction locks the issue row, rejects other pending applications and sets the issue to `claimed`; the trigger logs `open -> claimed`.
5. *Sign in*: `login_attempts` is consulted first; after 5 failures in 15 minutes the API answers 429.

## 5. Application screenshots

All images are in `docs/screenshots/`. They were captured from the finished application with seeded demo data.

### Public pages
| | |
|---|---|
| **5.1 Landing page** | ![Landing](screenshots/01-landing.png) |
| **5.2 Sign up** (Contributor / Maintainer switch) | ![Sign up](screenshots/02-signup.png) |
| **5.3 Log in** | ![Log in](screenshots/03-login.png) |

### Contributor
**5.4 Dashboard.** Live counts from SQL subqueries and shortcuts.

![Contributor dashboard](screenshots/04-contributor-dashboard.png)

**5.5 Profile.** Bio, experience level and skills with proficiency. Saving stores the skills and re-computes the profile embedding in one transaction.

![Profile](screenshots/05-contributor-profile.png)

**5.6 Recommended feed.** Open issues ranked by cosine similarity to the profile (`match_issues()`); skills the contributor already has are ticked.

![Feed](screenshots/06-contributor-feed.png)

**5.7 Feed with filters.** Difficulty and skill filters narrow the ranked list (`?difficulty=easy&skill=Python`).

![Filtered feed](screenshots/07-contributor-feed-filtered.png)

**5.8 Hybrid search.** Keyword and semantic rankings fused; each result shows which method found it.

![Hybrid search](screenshots/08-search-hybrid.png)

**5.9 Keyword search finds nothing** for "screen reader support", because no issue contains those words.

![Keyword search, no results](screenshots/09-search-keyword-no-results.png)

**5.10 Semantic search finds it** for the same query, by meaning ("Dropdown menu is not keyboard accessible").

![Semantic search](screenshots/10-search-semantic-finds-it.png)

**5.11 My applications.** Status of every application, with Withdraw for pending ones; the trigger limits pending applications to 5.

![Applications](screenshots/11-contributor-applications.png)

**5.12 Account.** Change password, and delete the account (password required, cascades through the database).

![Account](screenshots/12-account.png)

### Maintainer
**5.13 Dashboard.**

![Maintainer dashboard](screenshots/13-maintainer-dashboard.png)

**5.14 Repositories** with open-issue counts (LEFT JOIN + GROUP BY).

![Repositories](screenshots/14-maintainer-repos.png)

**5.15 Issues of a repository** with difficulty, skills, status and number of pending applicants; closing an issue rejects its pending applications.

![Repository issues](screenshots/15-maintainer-repo-issues.png)

**5.16 New issue form.** On submit the API embeds the title, body and skill names, then inserts the issue and its skills in one transaction.

![New issue](screenshots/16-maintainer-new-issue-form.png)

**5.17 Applicant review, before deciding.** Skills, level, application time and a semantic match score (cosine similarity between profile and issue).

![Review before](screenshots/17-maintainer-review-before.png)

**5.18 After accepting one applicant.** The other applicant is rejected and the issue is `claimed`, all in one transaction that locks the issue row.

![Review after](screenshots/18-maintainer-review-after.png)

### Admin
**5.19 Admin dashboard.** Statistics read from the views `v_repo_stats`, `v_skill_demand` and `v_open_issues`.

![Admin dashboard](screenshots/19-admin-dashboard.png)

### SQL evidence
**5.20 Audit trigger.** `trg_issue_status_log` wrote the `open -> claimed` row automatically when the applicant in 5.18 was accepted.

![Status log](screenshots/20-sql-status-log.png)

**5.21 View `v_skill_demand`.** Skills with open issues versus contributors who have them.

![Skill demand view](screenshots/21-sql-skill-demand-view.png)

**5.22 Application states** for the same issue after accepting: one `accepted`, the other `rejected`.

![Application states](screenshots/22-sql-application-states.png)

**5.23 `match_issues()`.** The five closest open issues for one contributor with their similarity.

![match_issues output](screenshots/23-sql-match-issues.png)

## 6. Testing results

`npm test` runs 40 integration tests against the running application and the real database. **Result: 40 passed, 0 failed.**

| Group | Tests | Covers |
|---|---|---|
| Authentication | A1 to A8 | Login, duplicate and malformed email, weak password, admin role blocked at signup, generic error messages, logout, login rate limit |
| Role-based access | R1 to R4 | Contributor, maintainer and admin boundaries on every API |
| Profile, search, filters | P1, P2, S1, S2, F1, F2, H1 | Validation, embedding stored, ranked feed, semantic versus keyword, hybrid fusion, difficulty and skill filters |
| Applications | AP1 to AP7, CL1 | Apply, withdraw, re-apply, 5-pending limit (including a simultaneous-request race), close rule |
| Maintainer flow | M1 to M3 | Accept transaction, concurrent accepts (exactly one wins), embedded issue creation |
| Account | PW1, DEL1 to DEL4 | Password change, cascading deletion of accounts and repositories, admin protection |
| Database integrity | D1 to D5 | CHECK, FK, UNIQUE, trigger, views and functions, cascade |

The full table with expected behaviour for each case is in `03_testing.md`, which also lists the bugs the tests found.

## 7. Conclusion

DevMatch shows that one relational database can cover both the transactional rules of an issue tracker and the semantic search that makes matching useful. Constraints, transactions, locks and triggers keep the data consistent even under concurrent requests (one accepted applicant per issue, at most five pending applications per contributor, an audit trail of every status change), while pgvector lets the same SQL engine rank issues by meaning and fuse that ranking with keyword search. The application is secured in the backend with role-based access, hashed passwords and login rate limiting, and 40 automated tests, including two race-condition tests, check these guarantees against the real database.

Possible future work: a rejection reason on applications, notifications when an application is decided, a larger evaluation of match quality, and an admin screen for managing users.
