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
3. `docker compose up -d` creates the DB and runs `db/*.sql` on first start.
   To re-run the SQL from scratch: `docker compose down -v` then `docker compose up -d`.
4. `npm install`
5. `npm run dev` and open http://localhost:3000 (DB check: `/api/health`).

## Layout
- `db/` schema, seed and logic (triggers/functions) SQL
- `lib/db.ts` shared pg connection pool (reads `DATABASE_URL`)
- `app/` pages and API route handlers
