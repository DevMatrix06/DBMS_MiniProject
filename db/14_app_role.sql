-- Least-privilege login for the web app. The app server connects as dm_app (APP_DATABASE_URL in .env)
-- instead of the owner. It can read and write data but cannot change the schema or create users.
-- Seed, migrate and the tests still use the owner (DATABASE_URL). Safe to re-run: grants are re-applied,
-- so tables added later are covered too. Apply to an existing DB with:
--   docker exec -i devmatch-db psql -U devmatch -d devmatch < db/14_app_role.sql

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dm_app') THEN
        CREATE ROLE dm_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
               CONNECTION LIMIT 20 PASSWORD 'app_pass_123';   -- demo password, change it for real use
    END IF;
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO dm_app', current_database());
END
$$;

ALTER ROLE dm_app VALID UNTIL '2027-12-31';

GRANT USAGE ON SCHEMA public TO dm_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dm_app;
