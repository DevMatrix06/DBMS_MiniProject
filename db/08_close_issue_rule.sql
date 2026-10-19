-- When an issue is closed, its still-pending applications can never be answered, so reject them.
-- Runs on first start (see docker-compose.yml). Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/08_close_issue_rule.sql
-- Accepted applications are kept as they are (the work may already have been done).

CREATE OR REPLACE FUNCTION reject_pending_on_close() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE applications
    SET status = 'rejected'
    WHERE issue_id = NEW.issue_id AND status = 'pending';
    RETURN NULL;  -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_pending_on_close ON issues;
CREATE TRIGGER trg_reject_pending_on_close
AFTER UPDATE OF status ON issues
FOR EACH ROW
WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
EXECUTE FUNCTION reject_pending_on_close();
