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

## Result: 40 passed, 0 failed (about 20 s)

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
| F1 | Difficulty and skill filters: every result of hybrid, semantic and keyword search respects them; invalid difficulty is 400; unknown skill gives no results | Filtered search |
| F2 | `hybrid_search()` applies the filters before ranking; `/api/skills` lists skills and needs a session | Stored function with parameters |
| H1 | Hybrid search puts an issue found by both keyword and semantic search first; results are ordered by fused score; semantic-only matches still appear | `hybrid_search()`, Reciprocal Rank Fusion, GIN + HNSW indexes |
| AP1 | Applying creates a pending application (201) | Apply flow |
| AP2 | Applying twice is rejected (409) | UNIQUE (issue, contributor) |
| AP3 | Another contributor cannot withdraw my application (404) | Ownership check |
| AP4 | Withdraw works; applying again reactivates the same row | Application lifecycle |
| AP5 | Applying to a non-existent issue is 404 | Foreign key |
| AP6 | A 6th pending application is rejected until one is withdrawn | Trigger `trg_application_rules` |
| AP7 | Six simultaneous applications by one contributor: exactly 5 succeed | Trigger plus advisory lock (race condition) |
| CL1 | Closing an issue rejects its pending applications but keeps an accepted one; audit log shows `claimed` then `closed` | Trigger `trg_reject_pending_on_close` |
| M1 | Non-owner cannot accept (404); owner accepts, issue becomes `claimed`, other applicants `rejected`, audit row `open -> claimed` written, second accept 409, late application 409 | Transaction, row lock, trigger `trg_issue_status_log` |
| M2 | Two simultaneous accepts on one issue: exactly one 200 and one 409 | `SELECT ... FOR UPDATE` (race condition) |
| M3 | Maintainer creates an issue (embedded, 768 dims); duplicate title 409; other maintainer 404; contributor 403 | Transaction with embedding, ownership |
| PW1 | Wrong current password 403; weak or unchanged new password 400; after a change the old password stops working and the new one works; anonymous 401 | Password change |
| DEL1 | A wrong password cannot delete an account and nothing is removed; the correct one deletes the contributor, profile, skills and applications, clears the session, and leaves the issue itself intact | DELETE with cascade, re-authentication |
| DEL2 | Deleting a maintainer removes their repository, issues and the applications to them, and spares the applicant's account | Multi-level cascade |
| DEL3 | An admin account cannot be deleted through the API (403) | Admin protection |
| DEL4 | Deleting a repository: other maintainer 404, contributor 403, owner 200 with counts; issues and applications are gone; deleting again is 404 | Ownership, cascade |
| D1 | Invalid difficulty, too-short title, proficiency 6 rejected by the database | CHECK constraints |
| D2 | Application for a missing issue and a duplicate application rejected | FOREIGN KEY, UNIQUE |
| D3 | Raw SQL insert of an application for a closed issue is rejected | Trigger works even when the API is bypassed |
| D4 | The three views and `match_issues()` return rows | Views, stored function |
| D5 | Deleting a user removes their contributor profile and applications | ON DELETE CASCADE |

## Bugs the tests and reviews found
- **AP5 / D2 (first run):** applying to a non-existent issue returned 409 "not open (status: missing)" instead of 404,
  because the trigger ran before the foreign key check. Fixed in `db/07_application_rules.sql`: for an unknown issue the
  trigger now lets the foreign key reject the row.
- **Fresh database failed to start:** found while reviewing the maintainer pull request. `docker-compose.yml` mounted every
  file in `db/` as an init script, so the demo script `06_alter_demo.sql` ran on an empty database and failed. Fixed by
  mounting only the init scripts.
- **Sign-in failed on older databases:** after the login rate limit was added, a database created before the
  `login_attempts` table existed answered every login with an empty HTTP 500. Fixed with a clear 503 message, a schema check in
  `/api/health`, and `npm run db:update`, which applies the missing objects without touching data.
- **Accept button used the browser's native `confirm()`:** it looked out of place and cannot be automated. Replaced with an inline two-step confirmation.
