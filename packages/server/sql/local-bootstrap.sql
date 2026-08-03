-- Local bootstrap: prepares a plain local PostgreSQL for the app.
--
-- Usage (from repo root):
--   psql -h 127.0.0.1 -p 5433 -U postgres -d mault -f packages/server/sql/local-bootstrap.sql
--
-- Run it BEFORE db:migrate (the function/role must exist before the RLS
-- policies reference them) and again AFTER db:migrate (grants must be
-- (re)applied to whatever tables exist).

-- pgvector (cards.embedding is vector(768)).
CREATE EXTENSION IF NOT EXISTS vector;

-- The role the RLS crudPolicy() policies are granted to (drizzle-orm/neon/rls
-- emits "TO authenticated").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Used by the org RLS policies (see orgRls in packages/server/src/db/schema.ts).
-- This is a fully-local, single-user build: there is no auth, so membership is
-- simply "the request's org_id claim matches the row's org_id" (requireOrg in
-- middleware/auth.ts always injects the same local org).
CREATE OR REPLACE FUNCTION auth_is_org_member(org_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (current_setting('request.jwt.claims', true)::json ->> 'org_id') = org_id;
END;
$$;

-- Table privileges for the authenticated role, so the RLS policies are
-- exercisable (a role without grants can't touch the tables at all).
-- Idempotent: re-run after db:migrate so newly created tables get grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Default privileges: future tables (created by later migrations) inherit
-- the grants automatically.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
