-- Durable retry state for connector sync recovery after provider/database outages.
ALTER TABLE "ConnectorAccount"
  ADD COLUMN IF NOT EXISTS "lastSyncAttemptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT,
  ADD COLUMN IF NOT EXISTS "syncFailureCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "syncRetryAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ConnectorAccount_workspaceId_status_syncRetryAt_idx"
  ON "ConnectorAccount" ("workspaceId", "status", "syncRetryAt");
