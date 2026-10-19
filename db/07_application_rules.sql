-- Application rules enforced in the database, so no code path can bypass them:
--   1. you can only apply to an issue that is open
--   2. a contributor can have at most 5 pending applications at once
-- Runs on first start (see docker-compose.yml). Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/07_application_rules.sql

CREATE OR REPLACE FUNCTION enforce_application_rules() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_status  TEXT;
    v_pending INT;
BEGIN
    -- Only when an application BECOMES pending: a new row, or re-applying after a withdrawal.
    -- Accept/reject/withdraw updates are not affected.
    IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pending') THEN

        -- FOR SHARE stops a maintainer from claiming the issue between this check and our commit.
        SELECT status INTO v_status FROM issues WHERE issue_id = NEW.issue_id FOR SHARE;
        IF NOT FOUND THEN
            RETURN NEW;  -- unknown issue: let the foreign key reject it (23503) instead of a misleading message
        END IF;
        IF v_status <> 'open' THEN
            RAISE EXCEPTION 'This issue is not open for applications (status: %)', v_status;
        END IF;

        -- Serialise per contributor so two simultaneous applications cannot both slip under the limit.
        PERFORM pg_advisory_xact_lock(NEW.contributor_id);

        SELECT count(*) INTO v_pending
        FROM applications
        WHERE contributor_id = NEW.contributor_id
          AND status = 'pending'
          AND application_id IS DISTINCT FROM NEW.application_id;

        IF v_pending >= 5 THEN
            RAISE EXCEPTION 'You can have at most 5 pending applications. Withdraw one first.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_application_rules ON applications;
CREATE TRIGGER trg_application_rules
BEFORE INSERT OR UPDATE OF status ON applications
FOR EACH ROW EXECUTE FUNCTION enforce_application_rules();
