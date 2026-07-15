-- Transactional CI smoke test for authenticated RLS. Synthetic identities and
-- grants are rolled back, so the E2E seed starts from an empty application DB.

BEGIN;

SET LOCAL search_path = w3ads, public;

GRANT USAGE ON SCHEMA w3ads TO authenticated;
GRANT SELECT ON
  w3ads."User",
  w3ads."Workspace",
  w3ads."Membership",
  w3ads."SyncJob",
  w3ads."WorkspaceSyncState",
  w3ads."ProductInventory"
TO authenticated;

INSERT INTO w3ads."User" ("id", "email", "platformRole", "createdAt", "updatedAt")
VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner-a@rls.test', 'USER', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'admin-b@rls.test', 'USER', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'viewer-a@rls.test', 'USER', now(), now()),
  ('44444444-4444-4444-8444-444444444444', 'client-b@rls.test', 'USER', now(), now());

INSERT INTO w3ads."Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
VALUES
  ('ci-rls-workspace-a', 'CI RLS Workspace A', 'ci-rls-a', now(), now()),
  ('ci-rls-workspace-b', 'CI RLS Workspace B', 'ci-rls-b', now(), now());

INSERT INTO w3ads."Membership" ("id", "userId", "workspaceId", "role")
VALUES
  ('ci-rls-owner-a', '11111111-1111-4111-8111-111111111111', 'ci-rls-workspace-a', 'OWNER'),
  ('ci-rls-admin-b', '22222222-2222-4222-8222-222222222222', 'ci-rls-workspace-b', 'ADMIN'),
  ('ci-rls-viewer-a', '33333333-3333-4333-8333-333333333333', 'ci-rls-workspace-a', 'VIEWER'),
  ('ci-rls-client-b', '44444444-4444-4444-8444-444444444444', 'ci-rls-workspace-b', 'CLIENT');

INSERT INTO w3ads."ConnectorAccount" (
  "id",
  "workspaceId",
  "provider",
  "externalAccountId",
  "accountName",
  "accessTokenCiphertext",
  "tokenIv",
  "tokenAuthTag",
  "createdAt",
  "updatedAt"
)
VALUES
  (
    'ci-rls-connector-a',
    'ci-rls-workspace-a',
    'META_ADS',
    'ci-rls-external-a',
    'CI RLS Connector A',
    'ciphertext',
    'iv',
    'tag',
    now(),
    now()
  ),
  (
    'ci-rls-connector-b',
    'ci-rls-workspace-b',
    'META_ADS',
    'ci-rls-external-b',
    'CI RLS Connector B',
    'ciphertext',
    'iv',
    'tag',
    now(),
    now()
  );

INSERT INTO w3ads."SyncJob" (
  "id",
  "connectorAccountId",
  "workspaceId",
  "provider",
  "status"
)
VALUES
  ('ci-rls-sync-a', 'ci-rls-connector-a', 'ci-rls-workspace-a', 'META_ADS', 'SUCCESS'),
  ('ci-rls-sync-b', 'ci-rls-connector-b', 'ci-rls-workspace-b', 'META_ADS', 'SUCCESS');

INSERT INTO w3ads."WorkspaceSyncState" ("id", "workspaceId", "updatedAt")
VALUES
  ('ci-rls-state-a', 'ci-rls-workspace-a', now()),
  ('ci-rls-state-b', 'ci-rls-workspace-b', now());

INSERT INTO w3ads."ProductInventory" (
  "id",
  "workspaceId",
  "connectorAccountId",
  "externalProductId",
  "productName",
  "updatedAt"
)
VALUES
  (
    'ci-rls-product-a',
    'ci-rls-workspace-a',
    'ci-rls-connector-a',
    'ci-rls-external-product-a',
    'CI RLS Product A',
    now()
  ),
  (
    'ci-rls-product-b',
    'ci-rls-workspace-b',
    'ci-rls-connector-b',
    'ci-rls-external-product-b',
    'CI RLS Product B',
    now()
  );

DO $permissions$
DECLARE
  missing_rls text[];
BEGIN
  IF has_schema_privilege('anon', 'w3ads_private', 'USAGE')
    OR has_function_privilege(
      'anon',
      'w3ads_private.can_read_workspace_members(text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'anon can access the private RLS helper';
  END IF;

  IF NOT has_schema_privilege('authenticated', 'w3ads_private', 'USAGE')
    OR NOT has_function_privilege(
      'authenticated',
      'w3ads_private.can_read_workspace_members(text)',
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'authenticated cannot execute the private RLS helper';
  END IF;

  SELECT COALESCE(array_agg(class.relname ORDER BY class.relname), ARRAY[]::text[])
  INTO missing_rls
  FROM pg_catalog.pg_class AS class
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'w3ads'
    AND class.relname IN ('SyncJob', 'WorkspaceSyncState', 'ProductInventory')
    AND NOT class.relrowsecurity;

  IF cardinality(missing_rls) <> 0 THEN
    RAISE EXCEPTION 'Workspace-scoped tables missing RLS: %', missing_rls;
  END IF;
END
$permissions$;

SET LOCAL ROLE authenticated;

DO $verify$
DECLARE
  identity_id text;
  expected_slug text;
  expected_email text;
  expected_memberships integer;
  expected_sync_jobs integer;
  visible_slugs text[];
  visible_emails text[];
  visible_memberships integer;
  visible_sync_jobs integer;
  visible_internal_rows integer;
BEGIN
  FOR identity_id, expected_slug, expected_email, expected_memberships, expected_sync_jobs IN
    SELECT *
    FROM (
      VALUES
        ('11111111-1111-4111-8111-111111111111', 'ci-rls-a', 'owner-a@rls.test', 2, 1),
        ('22222222-2222-4222-8222-222222222222', 'ci-rls-b', 'admin-b@rls.test', 2, 1),
        ('33333333-3333-4333-8333-333333333333', 'ci-rls-a', 'viewer-a@rls.test', 2, 1),
        ('44444444-4444-4444-8444-444444444444', 'ci-rls-b', 'client-b@rls.test', 1, 0)
    ) AS test_case(
      identity_id,
      expected_slug,
      expected_email,
      expected_memberships,
      expected_sync_jobs
    )
  LOOP
    PERFORM set_config('request.jwt.claim.sub', identity_id, true);

    SELECT COALESCE(array_agg("slug" ORDER BY "slug"), ARRAY[]::text[])
    INTO visible_slugs
    FROM w3ads."Workspace";

    IF visible_slugs IS DISTINCT FROM ARRAY[expected_slug]::text[] THEN
      RAISE EXCEPTION 'Workspace RLS leak for %: saw %', identity_id, visible_slugs;
    END IF;

    SELECT COALESCE(array_agg("email" ORDER BY "email"), ARRAY[]::text[])
    INTO visible_emails
    FROM w3ads."User";

    IF visible_emails IS DISTINCT FROM ARRAY[expected_email]::text[] THEN
      RAISE EXCEPTION 'User RLS leak for %: saw %', identity_id, visible_emails;
    END IF;

    SELECT count(*)::integer
    INTO visible_memberships
    FROM w3ads."Membership";

    IF visible_memberships <> expected_memberships THEN
      RAISE EXCEPTION
        'Membership RLS leak for %: expected %, saw %',
        identity_id,
        expected_memberships,
        visible_memberships;
    END IF;

    SELECT count(*)::integer
    INTO visible_sync_jobs
    FROM w3ads."SyncJob";

    IF visible_sync_jobs <> expected_sync_jobs THEN
      RAISE EXCEPTION
        'SyncJob RLS leak for %: expected %, saw %',
        identity_id,
        expected_sync_jobs,
        visible_sync_jobs;
    END IF;

    SELECT
      (SELECT count(*) FROM w3ads."WorkspaceSyncState")
      + (SELECT count(*) FROM w3ads."ProductInventory")
    INTO visible_internal_rows;

    IF visible_internal_rows <> 0 THEN
      RAISE EXCEPTION
        'Internal table RLS leak for %: saw % rows',
        identity_id,
        visible_internal_rows;
    END IF;
  END LOOP;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  SELECT COALESCE(array_agg("slug" ORDER BY "slug"), ARRAY[]::text[])
  INTO visible_slugs
  FROM w3ads."Workspace";

  IF cardinality(visible_slugs) <> 0 THEN
    RAISE EXCEPTION 'Unauthenticated RLS leak: saw %', visible_slugs;
  END IF;
END
$verify$;

RESET ROLE;
ROLLBACK;
