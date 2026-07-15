-- Membership policies previously queried Membership from inside its own RLS
-- predicate, which causes PostgreSQL to abort with "infinite recursion".
-- Keep the existing role semantics while moving that lookup behind a tightly
-- scoped SECURITY DEFINER helper owned by the migration role. Keep it outside
-- the PostgREST-exposed application schema so anon cannot discover or call it.

CREATE SCHEMA IF NOT EXISTS w3ads_private;
REVOKE ALL ON SCHEMA w3ads_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA w3ads_private TO authenticated;

CREATE OR REPLACE FUNCTION w3ads_private.can_read_workspace_members(target_workspace_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM w3ads."Membership" AS membership
    WHERE membership."workspaceId" = target_workspace_id
      AND membership."userId" = (SELECT auth.uid())::text
      AND membership."role" IN ('OWNER', 'ADMIN', 'VIEWER')
  )
$function$;

REVOKE ALL ON FUNCTION w3ads_private.can_read_workspace_members(text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION w3ads_private.can_read_workspace_members(text) TO authenticated;

DROP POLICY IF EXISTS "membership_member_read" ON w3ads."Membership";
CREATE POLICY "membership_member_read" ON w3ads."Membership"
  FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      "userId" = (SELECT auth.uid())::text
      OR w3ads_private.can_read_workspace_members("workspaceId")
    )
  );

-- These workspace-scoped tables are covered by Supabase's default DML grants.
-- SyncJob already has a member-read policy; the other two are internal Prisma
-- state and intentionally remain deny-by-default to Data API roles.
ALTER TABLE w3ads."SyncJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE w3ads."WorkspaceSyncState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE w3ads."ProductInventory" ENABLE ROW LEVEL SECURITY;
