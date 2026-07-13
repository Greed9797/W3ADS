-- Mirror of the Prisma migration for Supabase CLI workflows. The deployed app
-- runs `prisma migrate deploy` against the isolated w3ads schema.
ALTER TABLE IF EXISTS w3ads."ConnectorAccount"
  ADD COLUMN IF NOT EXISTS "lastSyncAttemptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT,
  ADD COLUMN IF NOT EXISTS "syncFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "syncRetryAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConnectorAccount_workspaceId_status_syncRetryAt_idx"
  ON w3ads."ConnectorAccount" ("workspaceId", "status", "syncRetryAt");

NOTIFY pgrst, 'reload schema';
