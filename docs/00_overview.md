# DevMatch: Semantic Matching of Open-Source Issues to Contributor Skills

DBMS Experiential Learning, Level 3 project. Team: Tejas P (PES1UG24CS497) and Tanmay T A (PES1UG24CS492).

## 1. Problem statement

Open-source projects label hundreds of issues "good first issue" or "help wanted", but a newcomer still has to read
them one by one to find work that fits what they know. Keyword search does not help much: a contributor who knows
"database performance tuning" will not find an issue titled "Speed up monthly report query" by typing those words.
On the other side, a maintainer receiving applications has no quick way to see which applicant is the best fit.

DevMatch turns issue descriptions and contributor profiles into vector embeddings, ranks open issues by how closely
they match a contributor, and gives maintainers a review screen that shows each applicant's skills and a match score.

## 2. Objectives

1. Design a normalised relational schema (3NF) for users, repositories, issues, skills and applications, with
   integrity enforced by the database itself (keys, CHECK, UNIQUE, cascades).
2. Store text embeddings next to the relational data with PostgreSQL + pgvector and rank issues by cosine similarity,
   including hybrid ranking that fuses keyword and semantic search.
3. Keep the application consistent under concurrent use with transactions, row locks, advisory locks and triggers.
4. Provide a secure role-based web application (contributor, maintainer, admin) built with Next.js on top of the database.
5. Show the database working: views and analytic queries, an audit trail, automated tests, and documentation.

## 3. Functional requirements

### Contributor
| ID | Requirement |
|---|---|
| C1 | Sign up, log in and log out; change password; delete the account and all data that belongs to it |
| C2 | Create a profile: bio, experience level and skills with a 1 to 5 proficiency; saving re-computes the profile embedding |
| C3 | See a paginated feed of open issues ranked by similarity to the profile, with the contributor's own skills highlighted |
| C4 | Filter the feed by difficulty and by required skill |
| C5 | Search issues in three modes (keyword, semantic, hybrid) with the same filters |
| C6 | Apply to an issue (at most 5 pending applications; only open issues), withdraw, and re-apply after a withdrawal |
| C7 | Follow the status of every application (pending, accepted, rejected, withdrawn) |

### Maintainer
| ID | Requirement |
|---|---|
| M1 | Create repositories and delete them (cascading to issues and applications) |
| M2 | Create issues with skills and difficulty; the issue is embedded when created and re-embedded when edited |
| M3 | Close an issue; its pending applications are rejected automatically |
| M4 | Review applicants for an issue (skills, level, match score) and accept or reject; accepting claims the issue and rejects the rest atomically |
| M5 | See only their own repositories and applicants |

### Admin
| ID | Requirement |
|---|---|
| A1 | View platform analytics (repository statistics, skill demand versus supply, open issues, users and applications by status) read from SQL views |

### Cross-cutting (non-functional)
| ID | Requirement |
|---|---|
| N1 | Authentication in the backend (bcrypt password hashes, signed JWT in an httpOnly cookie); role checks on every API |
| N2 | Credentials and secrets only in environment variables; `.env` is git-ignored |
| N3 | Input validated twice: in the API, and again by database constraints |
| N4 | Brute-force protection on login (5 failures per email per 15 minutes) |
| N5 | Every status change of an issue is recorded by a trigger (audit trail) |
| N6 | Automated tests cover the rules above (see `03_testing.md`) |

## 4. Team responsibilities

| Area | Tejas | Tanmay |
|---|---|---|
| Database | Schema, constraints, indexes, triggers, `match_issues()`, `hybrid_search()`, login attempts, migrations | Views, analytic queries, ALTER / DROP demo |
| Backend | Authentication, embeddings, search and match, contributor APIs, applications, account | Maintainer APIs, application review (accept / reject), admin statistics |
| Frontend | Design system, landing, auth, contributor pages, dashboard | Maintainer pages, review screen, admin dashboard |
| Quality and docs | Test suite (40 cases), testing and demo documents | ER diagram, schema, data dictionary, design and architecture documents |

Both members worked on database design and on the web application. Commit history on GitHub shows each member's work.

## 5. Technology stack

| Layer | Choice |
|---|---|
| Frontend and API | Next.js 16 (App Router, Route Handlers), React 19, TypeScript |
| Relational database | PostgreSQL 16 |
| Vector search | pgvector 0.8 (HNSW index, cosine distance) |
| Embeddings | Google Gemini `gemini-embedding-001`, 768 dimensions |
| Auth | bcryptjs, `jose` (JWT) |
| Tests | Node built-in test runner (`node --test`) against the running app and database |
| Tooling | Docker Compose, Git and GitHub |

## 6. Traceability: project requirements to where they are met

| Requirement from the project brief | Where it is met |
|---|---|
| 1. Unique, non-CRUD project | Semantic matching, hybrid search, rule-enforcing triggers, concurrency control (this document) |
| 2. Two members, both on database and app | Section 4 |
| 3. SQL plus vector database | PostgreSQL + pgvector (`02_design_vector_queries.md` section 1) |
| 4. ER diagram, relational schema, constraints | `01_er_diagram_and_schema.md`, `er_diagram.png` |
| 4. Vector data model, indexes, embeddings, metadata, retrieval | `02_design_vector_queries.md` section 2 |
| 5. CREATE, ALTER, DROP, keys, constraints, indexes, views | `db/01_schema.sql`, `db/06_alter_demo.sql`, `db/04_views.sql` |
| 6. INSERT, UPDATE, DELETE, SELECT | Application flows (apply, withdraw, accept, delete account, delete repository) and `db/05_queries.sql` |
| 6. JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `db/05_queries.sql` (Q1 to Q10) |
| 7. Four or more advanced SQL concepts plus one vector concept | Section 7 below |
| 8. Embedding explanation | `02_design_vector_queries.md` section 2 |
| 9. Next.js interface with forms, tables, search, filtering, dashboards | `screenshots/` (23 images) |
| 10. API layer, no hard-coded credentials | `app/api/*`, `.env.example`, `lib/db.ts` |
| 11. Authentication and at least two roles | `lib/auth.ts`; roles contributor, maintainer, admin |
| 12. Validation and integrity in the database | CHECK, UNIQUE, FK, triggers; tests D1 to D5 |
| 13. Documentation | This `docs/` folder |
| 14. Git and GitHub, README | Public repository, `README.md` |
| 15. Demonstration | `04_demo_and_viva.md` |
| 16. Originality | Original design and implementation |
| 17. Justified database choices | `02_design_vector_queries.md` section 1 |

## 7. Advanced database features used

| Feature | Where |
|---|---|
| Triggers | `trg_issue_status_log` (audit), `trg_application_rules` (open issue only, max 5 pending, advisory lock), `trg_reject_pending_on_close` |
| Stored functions | `match_issues()` (vector ranking), `hybrid_search()` (reciprocal rank fusion with filters) |
| Transactions and locking | Signup, profile save, accept applicant (`FOR UPDATE`), apply (re-activation), account and repository deletion |
| Views | `v_open_issues`, `v_skill_demand`, `v_repo_stats` |
| Indexing | HNSW (vectors), GIN (full text), B-tree for filters and foreign keys |
| Full-text search | Generated `tsvector` column with a GIN index, `websearch_to_tsquery` |
| Vector similarity search | `pgvector` cosine distance (`<=>`) |
| Cascading deletes | `ON DELETE CASCADE` on every foreign key |
