-- Stored procedure: accept one application in a single call.
-- A maintainer accepting an applicant must do three things together or not at all:
--   1. mark that application 'accepted'
--   2. reject every other pending application for the same issue
--   3. set the issue to 'claimed'  (trg_issue_status_log then writes the audit row)
-- The issue row is locked first (FOR UPDATE), so two simultaneous accepts cannot both win.
-- Run it with:  CALL accept_application(<application_id>);
-- Safe to re-run. Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/13_accept_procedure.sql

CREATE OR REPLACE PROCEDURE accept_application(p_application_id INT)
LANGUAGE plpgsql AS $$
DECLARE
    v_issue_id   INT;
    v_app_status TEXT;
    v_issue_stat TEXT;
BEGIN
    SELECT issue_id INTO v_issue_id FROM applications WHERE application_id = p_application_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application % does not exist', p_application_id;
    END IF;

    -- Lock the issue first so concurrent accepts for the same issue run one after the other.
    SELECT status INTO v_issue_stat FROM issues WHERE issue_id = v_issue_id FOR UPDATE;
    IF v_issue_stat <> 'open' THEN
        RAISE EXCEPTION 'Issue % is not open (status: %)', v_issue_id, v_issue_stat;
    END IF;

    SELECT status INTO v_app_status FROM applications WHERE application_id = p_application_id FOR UPDATE;
    IF v_app_status <> 'pending' THEN
        RAISE EXCEPTION 'Application % is not pending (status: %)', p_application_id, v_app_status;
    END IF;

    UPDATE applications SET status = 'accepted' WHERE application_id = p_application_id;

    UPDATE applications SET status = 'rejected'
    WHERE issue_id = v_issue_id AND status = 'pending' AND application_id <> p_application_id;

    UPDATE issues SET status = 'claimed' WHERE issue_id = v_issue_id;
END;
$$;
