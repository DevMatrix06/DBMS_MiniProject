-- ALTER / DROP demo (Task 3). Run with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/06_alter_demo.sql
-- Everything runs in one transaction and the script drops what it created, so the real schema
-- (01_schema.sql) is left unchanged, and the final ROLLBACK undoes the sample UPDATE as well.
-- Failing statements are shown commented out; uncomment one to see the constraint reject the row.

BEGIN;

-- 1. ALTER TABLE ... ADD COLUMN with an inline CHECK constraint.
ALTER TABLE issues ADD COLUMN estimated_hours INT CHECK (estimated_hours > 0);

-- The new column is NULL for existing rows; fill one in and read it back.
UPDATE issues SET estimated_hours = 4 WHERE issue_id = (SELECT MIN(issue_id) FROM issues);
SELECT issue_id, title, estimated_hours FROM issues WHERE estimated_hours IS NOT NULL;

-- UPDATE issues SET estimated_hours = 0 WHERE issue_id = 1;   -- ERROR: violates the CHECK (> 0)

-- 2. ALTER TABLE ... ADD CONSTRAINT (named, so it can be dropped later).
ALTER TABLE issues
  ADD CONSTRAINT chk_estimated_hours_max CHECK (estimated_hours IS NULL OR estimated_hours <= 200);

-- UPDATE issues SET estimated_hours = 500 WHERE issue_id = 1; -- ERROR: violates chk_estimated_hours_max

-- 3. CREATE INDEX on the new column (partial: only rows that have an estimate).
CREATE INDEX idx_issues_estimated_hours ON issues (estimated_hours) WHERE estimated_hours IS NOT NULL;

-- 4. ALTER COLUMN: give the column a default, then undo it.
ALTER TABLE issues ALTER COLUMN estimated_hours SET DEFAULT 8;
ALTER TABLE issues ALTER COLUMN estimated_hours DROP DEFAULT;

-- 5. RENAME COLUMN and back.
ALTER TABLE issues RENAME COLUMN estimated_hours TO est_hours;
ALTER TABLE issues RENAME COLUMN est_hours TO estimated_hours;

-- 6. See the changed structure in the catalog.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'issues' AND column_name = 'estimated_hours';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'issues'::regclass AND conname LIKE '%estimated_hours%';

-- 7. A throw-away table to demonstrate DROP TABLE.
CREATE TABLE demo_issue_labels (
    label_id  SERIAL PRIMARY KEY,
    issue_id  INT NOT NULL REFERENCES issues(issue_id) ON DELETE CASCADE,
    label     TEXT NOT NULL
);
INSERT INTO demo_issue_labels (issue_id, label) SELECT MIN(issue_id), 'good first issue' FROM issues;
SELECT * FROM demo_issue_labels;

-- 8. DROP everything the demo created, from the most dependent object outwards.
DROP TABLE demo_issue_labels;                                  -- DROP TABLE
DROP INDEX idx_issues_estimated_hours;                         -- DROP INDEX
ALTER TABLE issues DROP CONSTRAINT chk_estimated_hours_max;    -- DROP CONSTRAINT
ALTER TABLE issues DROP COLUMN estimated_hours;                -- DROP COLUMN (also removes its inline CHECK)

-- Proof that the schema is back to normal: this returns zero rows.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'issues' AND column_name = 'estimated_hours';

ROLLBACK;  -- also undoes the UPDATE in step 1, so no data is changed either
