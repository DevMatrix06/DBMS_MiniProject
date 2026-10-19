# DevMatch: database choice, vector search, queries, architecture

## 1. Database choice and justification

**Why PostgreSQL (relational).** The data is highly structured and interlinked: users, repositories, issues, skills and applications are connected by foreign keys, and the rules that matter are integrity rules (an issue belongs to exactly one repository, a contributor applies to an issue at most once, status values come from a fixed set). A relational database enforces these with PRIMARY KEY, FOREIGN KEY, UNIQUE and CHECK constraints, and it gives us transactions (accepting an applicant must change three things atomically), row locks (`SELECT ... FOR UPDATE` prevents two maintainers accepting at once), triggers (the status audit log), views, and joins for analytics.

**Why pgvector (instead of a separate vector database).** Semantic matching needs nearest-neighbour search over embeddings, but real queries also need ordinary filters ("only open issues", "only this repository", "join the skills"). With the `vector` extension the embeddings live in the same rows as the rest of the data, so one SQL query combines the filter, the join and the vector ranking, in one transaction, with one backup and one connection pool. A separate vector store would force us to keep two systems in sync and to merge results in application code.

## 2. Vector search

| Aspect | Design |
|---|---|
| What is embedded | Issues: title, body and the names of the required skills (`"<title>\n<body>\nSkills: a, b"`). Contributors: bio and skill names (`"<bio>\nSkills: a, b"`). |
| Model | Google Gemini `gemini-embedding-001`, called from `lib/embeddings.ts` with task type `SEMANTIC_SIMILARITY` |
| Dimensions | 768 (`outputDimensionality`); vectors are L2-normalised in code because truncated vectors are not unit length |
| Storage | `issues.embedding vector(768)` and `contributors.profile_embedding vector(768)` |
| Metric | Cosine distance (`<=>`); similarity = `1 - distance` |
| Index | HNSW with `vector_cosine_ops` on both columns (approximate nearest neighbour, fast at larger sizes) |
| When vectors are written | Seed script for demo data; the maintainer API when an issue is created, and again when its title, body or skills are edited, so search always reflects the current text |
| Retrieval | `match_issues(contributor_id, limit)` (SQL function in `db/03_logic.sql`) returns the open issues closest to a contributor profile, used by `/api/match`; `/api/search` ranks issues against the embedding of a free-text query (semantic mode) or uses the full-text GIN index (keyword mode) |

Why embeddings: a contributor who writes "I like building REST backends in Node" should match an issue titled "Add pagination to the Express API" even though they share no keywords. Keyword search alone cannot do that.

## 3. Important queries

All are in `db/05_queries.sql` with comments. Views must be applied first (`db/04_views.sql`).

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

Other SQL artefacts: `db/04_views.sql` (3 views) and `db/06_alter_demo.sql` (ALTER TABLE ADD COLUMN / ADD CONSTRAINT / ALTER COLUMN / RENAME, CREATE INDEX, then DROP TABLE / INDEX / CONSTRAINT / COLUMN; runs in a transaction that is rolled back).

## 4. System architecture

![Architecture](architecture.png)

Source: `architecture.dot`.

- **Browser**: contributors, maintainers and admins use pages rendered by Next.js and call JSON APIs with `fetch`.
- **Next.js 16 app**: pages are React Server Components; business logic is in Route Handlers under `app/api/`. `lib/auth.ts` issues a JWT in an httpOnly cookie and `requireRole()` guards every API. `lib/db.ts` provides one `pg` connection pool; all SQL is parameterised.
- **Embedding service**: Gemini API, called only when text is created or changed (issues, profiles) and for semantic search queries.
- **PostgreSQL 16 + pgvector in Docker**: tables, constraints, indexes, the status trigger, `match_issues()` and the analytics views.

Key flows:

1. *Create issue*: maintainer POSTs the form, the API checks ownership, embeds title + body + skills, then inserts the issue and its skills in one transaction.
2. *Match*: contributor opens the feed, `/api/match` calls `match_issues()`, which orders open issues by cosine distance to the profile embedding.
3. *Accept applicant*: one transaction locks the issue, rejects other pending applications, sets the issue to `claimed`; the trigger logs `open -> claimed`.

## 5. Screenshots

Add PNGs to `docs/screenshots/` and list them here (suggested set):

1. Maintainer repository list (`/maintainer`)
2. New issue form (`/maintainer/repos/<id>/issues/new`)
3. Issue list with applicant counts
4. Applicant review page before and after accepting
5. Admin dashboard (`/admin`)
6. `SELECT * FROM issue_status_log;` after an accept

## 6. Testing results

To be filled in by Tejas once the automated tests exist.

| Test | Expected | Actual | Result |
|---|---|---|---|
| | | | |

## 7. Conclusion

DevMatch shows that one relational database can cover both the transactional rules of an issue tracker and the semantic search that makes matching useful. Constraints and transactions keep the data consistent (one accepted applicant per issue, an audit trail of every status change), while pgvector lets the same SQL engine rank issues by meaning. Possible future work: re-embedding contributor profiles when they change, a rejection reason on applications, notifications, and a larger evaluation of match quality.
