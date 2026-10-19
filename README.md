# DevMatch

Semantic matching of open-source issues to contributor skills.
DBMS Level 3 project: PostgreSQL + pgvector, Next.js (Route Handlers).

Contributors get open issues ranked by how well they fit their skills; maintainers review applicants with a match score;
admins see platform statistics. Issues and profiles are turned into embeddings, ranked with pgvector, and combined with
PostgreSQL full-text search (hybrid search).

## Features
- **Contributor:** profile with skills, ranked feed with difficulty and skill filters, keyword / semantic / hybrid search, apply and withdraw (max 5 pending), application tracking, change password, delete account
- **Maintainer:** repositories and issues (embedded on create or edit), applicant review with accept / reject, delete repository
- **Admin:** statistics from SQL views
- **Database:** 3NF schema with constraints, 3 triggers, 2 search functions, 3 views, HNSW and GIN indexes, cascading deletes
- **Security:** bcrypt, JWT in an httpOnly cookie, role checks on every API, login rate limiting, secrets only in `.env`
- **Quality:** 40 automated integration tests; full documentation in `docs/`

## Stack
- Next.js 16 (App Router) + TypeScript
- PostgreSQL 16 with pgvector (Docker)
- Hosted embeddings API (Gemini, 768-dim vectors, cosine similarity)

## Setup
1. Install Node 20+ and Docker Desktop.
2. Copy `.env.example` to `.env` and set the passwords/secrets.
3. `docker compose up -d` creates the DB and runs `db/01` to `db/04` and `db/07` to `db/11` (schema, seed, logic, views, application rules, close rule, hybrid search, login attempts, filter indexes) on first start. `db/05_queries.sql` and `db/06_alter_demo.sql` are demo scripts to run by hand (see `docs/`).
   To re-run the SQL from scratch: `docker compose down -v` then `docker compose up -d`.
4. `npm install`
5. Put your Gemini key in `EMBEDDING_API_KEY` (.env), then `npm run seed` to load demo repos, issues and contributors with embeddings (`npm run seed -- --reset` to redo). Demo password for all seeded users: `password123`.
6. `npm run dev` and open http://localhost:3000 (DB check: `/api/health`).
7. Tests (app and DB must be running): `npm test`. Details in `docs/03_testing.md`.

### Demo accounts (password `password123`)
| Role | Email |
|---|---|
| Contributor | `asha@devmatch.dev`, `karthik@devmatch.dev`, `meera@devmatch.dev`, `rohan@devmatch.dev`, `sneha@devmatch.dev`, `vikram@devmatch.dev` |
| Maintainer | `maintainer@devmatch.dev` |
| Admin | `admin@devmatch.dev` |

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the app on http://localhost:3000 |
| `npm run seed` | Load demo data with embeddings (`-- --reset` wipes and reloads, `-- --extras` adds the admin and sample applications) |
| `npm run db:migrate` | Apply the latest re-runnable SQL files to an existing database |
| `npm run db:update` | `db:migrate` plus the demo extras, for teammates with an older database |
| `npm test` | Run the 40 integration tests |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

## Updating an existing database
After `git pull`, if sign-in fails with "The database is out of date" (or `/api/health` shows `"schema":"outdated"`),
your database was created before newer SQL files were added. Apply them without losing data:

```
npm run db:update
```

`db:update` runs `npm run db:migrate` (adds the missing tables, functions, triggers and indexes) and then
`npm run seed -- --extras` (adds the demo admin `admin@devmatch.dev` and sample applications; safe to repeat).
No data is deleted. Then restart `npm run dev`.

`db:migrate` re-applies the re-runnable files (`db/04`, `db/07` to `db/11`) and checks that every required table, view,
function, trigger and index exists. A brand new database does not need it.

## Documentation
| File | Contents |
|---|---|
| `docs/00_overview.md` | Problem, objectives, functional requirements, team responsibilities, requirement traceability |
| `docs/01_er_diagram_and_schema.md` | ER diagram, relational schema, data dictionary, triggers and functions, cascades |
| `docs/02_design_vector_queries.md` | Database choice, vector search design, important queries, architecture, screenshots, testing summary, conclusion |
| `docs/03_testing.md` | All 40 test cases and the bugs they found |
| `docs/04_demo_and_viva.md` | Demo script, viva questions and answers, live-modification recipes |

## Layout
- `db/` schema, seed, logic (triggers and functions), views, queries and migrations in SQL
- `scripts/` seed and migrate scripts
- `lib/` shared code: database pool, auth, embeddings, schema check
- `app/` pages and API route handlers
- `components/` navigation, icons, the animated switch
- `tests/` integration tests
- `docs/` report material, diagrams and screenshots
