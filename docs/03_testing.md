# Testing

## How the tests work
`tests/api.test.mts` is an integration suite. It sends real HTTP requests to the running Next.js app and checks the
real PostgreSQL database directly (constraints, triggers, row locks). Each run creates its own users, repository and
issues (tagged with a unique id) and deletes them afterwards, so it can be run repeatedly.

```
docker compose up -d     # database
npm run seed             # demo data (needed by the match and search tests)
npm run dev              # app on http://localhost:3000
npm test                 # runs tests/api.test.mts with Node's built-in test runner
```

A few tests call the Gemini embeddings API (profile save, issue creation, semantic and hybrid search).

## Result: 33 passed, 0 failed (about 15 s)

| ID | Test case | What it proves |
|---|---|---|
| A1 | Login works, `/me` returns the user | Authentication and JWT session cookie |
| A2 | Duplicate email rejected (409) | UNIQUE constraint on `users.email` |
| A3 | Short password rejected (400) | Input validation |
| A4 | `admin` role cannot be chosen at signup (400) | Privilege escalation blocked |
| A5 | Malformed email rejected by the database (400) | CHECK constraint on `users.email` |
| A6 | Wrong password gives 401 with the same message as an unknown email | No account enumeration |
| A7 | `/me` without a session is 401; logout clears the session | Session handling |
| A8 | Five wrong passwords lock the email: the 6th attempt, even with the right password, gets 429 with a Retry-After header; other accounts and unknown emails behave the same way | Brute-force protection (`login_attempts` table) |
| R1 | Contributor calling a maintainer API gets 403 | Role-based access control |
| R2 | Maintainer cannot apply to issues (403) | Role-based access control |
| R3 | Non-admin gets 403 on admin stats; admin gets the views' data | Role-based access control, views |
| R4 | Search without a session is 401; match as maintainer is 403 | Authorization on read APIs |
| P1 | Too-short bio rejected (400) | Input validation |
| P2 | Saving a profile stores skills and a 768-dimension embedding; match feed returns issues ordered by similarity | Embedding storage, `match_issues()`, pgvector |
| S1 | Semantic search returns results for "make queries faster"; keyword search returns fewer | Vector search vs full-text search |
| S2 | One-character query rejected (400) | Input validation |
| AP1 | Applying creates a pending application (201) | Apply flow |
| AP2 | Applying twice is rejected (409) | UNIQUE (issue, contributor) |
| AP3 | Another contributor cannot withdraw my application (404) | Ownership check |
| AP4 | Withdraw works; applying again reactivates the same row | Application lifecycle |
| AP5 | Applying to a non-existent issue is 404 | Foreign key |
| AP6 | A 6th pending application is rejected until one is withdrawn | Trigger `trg_application_rules` |
| AP7 | Six simultaneous applications by one contributor: exactly 5 succeed | Trigger plus advisory lock (race condition) |
| M1 | Non-owner cannot accept (404); owner accepts, issue becomes `claimed`, other applicants `rejected`, audit row `open -> claimed` written, second accept 409, late application 409 | Transaction, row lock, trigger `trg_issue_status_log` |
| M2 | Two simultaneous accepts on one issue: exactly one 200 and one 409 | `SELECT ... FOR UPDATE` (race condition) |
| M3 | Maintainer creates an issue (embedded, 768 dims); duplicate title 409; other maintainer 404; contributor 403 | Transaction with embedding, ownership |
| H1 | Hybrid search puts an issue found by both keyword and semantic search first; results are ordered by fused score; semantic-only matches still appear | `hybrid_search()` function, Reciprocal Rank Fusion, GIN + HNSW indexes |
| CL1 | Closing an issue rejects its pending applications but keeps an accepted one; audit log shows `claimed` then `closed` | Trigger `trg_reject_pending_on_close` |
| D1 | Invalid difficulty, too-short title, proficiency 6 rejected by the database | CHECK constraints |
| D2 | Application for a missing issue and a duplicate application rejected | FOREIGN KEY, UNIQUE |
| D3 | Raw SQL insert of an application for a closed issue is rejected | Trigger works even when the API is bypassed |
| D4 | The three views and `match_issues()` return rows | Views, stored function |
| D5 | Deleting a user removes their contributor profile and applications | ON DELETE CASCADE |

## Bugs the tests found
- **AP5 / D2 (first run):** applying to a non-existent issue returned 409 "not open (status: missing)" instead of 404,
  because the trigger ran before the foreign key check. Fixed in `db/07_application_rules.sql`: for an unknown issue the
  trigger now lets the foreign key reject the row.
- A review of the maintainer pull request also found that `docker-compose.yml` mounted every file in `db/` as an init
  script, so a fresh database failed on the demo script `06_alter_demo.sql`. Fixed by mounting only the init scripts.
