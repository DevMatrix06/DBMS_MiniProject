# DevMatch

Semantic matching of open-source issues to contributor skills.
DBMS Level 3 project: PostgreSQL + pgvector, Next.js (Route Handlers).

## Stack
- Next.js (App Router) + TypeScript
- PostgreSQL 16 with pgvector (Docker)
- Hosted embeddings API (768-dim vectors, cosine similarity)

## Setup
1. Install Node 20+ and Docker Desktop.
2. Copy `.env.example` to `.env` and set the passwords/secrets.
3. `docker compose up -d` creates the DB and runs `db/01` to `db/04` and `db/07` to `db/11` (schema, seed, logic, views, application rules, close rule, hybrid search, login attempts, filter indexes) on first start. `db/05_queries.sql` and `db/06_alter_demo.sql` are demo scripts to run by hand (see `docs/`).
   To re-run the SQL from scratch: `docker compose down -v` then `docker compose up -d`.
4. `npm install`
5. Put your Gemini key in `EMBEDDING_API_KEY` (.env), then `npm run seed` to load demo repos, issues and contributors with embeddings (`npm run seed -- --reset` to redo). Demo password for all seeded users: `password123`.
6. `npm run dev` and open http://localhost:3000 (DB check: `/api/health`).
7. Tests (app and DB must be running): `npm test`. Details in `docs/03_testing.md`.

## Updating an existing database
After `git pull`, if sign-in fails with "The database is out of date" (or `/api/health` shows `"schema":"outdated"`),
your database was created before newer SQL files were added. Apply them without losing data:

```
npm run db:migrate
```

This re-applies the re-runnable files (`db/04`, `db/07` to `db/11`) and checks that every required table, view,
function, trigger and index exists. A brand new database does not need it.

## Layout
- `db/` schema, seed and logic (triggers/functions) SQL
- `scripts/` seed and migrate scripts
- `lib/db.ts` shared pg connection pool (reads `DATABASE_URL`)
- `app/` pages and API route handlers
