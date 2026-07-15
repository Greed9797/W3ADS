-- CI-only compatibility layer for application migrations that reference
-- Supabase-managed roles and auth.uid(). Production receives these objects
-- from Supabase itself; the ephemeral GitHub Actions Postgres does not.

DO $guard$
BEGIN
  IF current_database() <> 'w3ads_ci_ephemeral' THEN
    RAISE EXCEPTION
      'Refusing Supabase CI bootstrap outside w3ads_ci_ephemeral (current database: %)',
      current_database();
  END IF;
END
$guard$;

DO $do$
BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

DO $do$
BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

DO $do$
BEGIN
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$do$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$function$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
