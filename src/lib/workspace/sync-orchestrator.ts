import { ConnectorStatus, Prisma } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/db/prisma";
import { SYNC_HELPERS } from "@/lib/connectors/sync-helpers";
import {
  computeBackfillBatch,
  computeForegroundRange,
} from "@/lib/connectors/sync-range";

export const COOLDOWN_MS = 30 * 60 * 1000; // 30min on-login
export const BACKGROUND_THRESHOLD_MS = 90 * 60 * 1000; // 90min cron
export const LOCK_STALE_MS = 5 * 60 * 1000; // 5min — release stuck locks fast

export type TriggerOutcome = {
  triggered: boolean;
  reason:
    | "claimed"
    | "cooldown"
    | "locked"
    | "no_active_connectors"
    | "workspace_missing";
};

export type TriggerWorkspaceSyncInput = {
  workspaceId: string;
  triggeredBy: string;
  includeBackfill?: boolean;
  thresholdMs?: number;
  /** Internal hook to keep tests deterministic — defaults to fire-and-forget `void`. */
  runner?: (
    workspaceId: string,
    triggeredBy: string,
    options: { includeBackfill: boolean },
  ) => Promise<void> | void;
};

/**
 * Attempts to claim a workspace sync slot via atomic compare-and-swap.
 * If claimed, dispatches `runWorkspaceSync` (fire-and-forget by default).
 *
 * Cooldown: skips when `lastSyncedAt` is newer than `thresholdMs` ago.
 * Lock: skips when another sync started < LOCK_STALE_MS ago.
 */
export async function triggerWorkspaceSyncIfStale(
  input: TriggerWorkspaceSyncInput,
): Promise<TriggerOutcome> {
  const thresholdMs = input.thresholdMs ?? COOLDOWN_MS;
  const includeBackfill = input.includeBackfill ?? true;
  const now = new Date();
  const cooldownCutoff = new Date(now.getTime() - thresholdMs);
  const lockCutoff = new Date(now.getTime() - LOCK_STALE_MS);

  console.info(
    `[sync-orchestrator] triggerWorkspaceSyncIfStale workspace=${input.workspaceId} triggeredBy=${input.triggeredBy} thresholdMs=${thresholdMs}`,
  );

  const workspace = await prisma.workspace.findUnique({
    where: { id: input.workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    return { triggered: false, reason: "workspace_missing" };
  }

  const activeCount = await prisma.connectorAccount.count({
    where: { workspaceId: input.workspaceId, status: ConnectorStatus.ACTIVE },
  });
  if (activeCount === 0) {
    return { triggered: false, reason: "no_active_connectors" };
  }

  // Atomic insert-or-claim: single round-trip that creates the row on first
  // call and only claims when cooldown passed AND no fresh lock. The conditional
  // sits inside ON CONFLICT DO UPDATE, so two concurrent callers can never both
  // claim — Postgres serializes the row-level update.
  const claimedRows = await prisma.$queryRaw<Array<{ workspaceId: string }>>(
    Prisma.sql`
      INSERT INTO w3ads."WorkspaceSyncState" (
        "workspaceId", "lastSyncStartedAt", "lastSyncStatus", "triggeredBy",
        "syncCount", "createdAt", "updatedAt"
      )
      VALUES (
        ${input.workspaceId}, ${now}, 'IN_PROGRESS', ${input.triggeredBy},
        0, ${now}, ${now}
      )
      ON CONFLICT ("workspaceId") DO UPDATE
        SET "lastSyncStartedAt" = EXCLUDED."lastSyncStartedAt",
            "lastSyncStatus"    = EXCLUDED."lastSyncStatus",
            "triggeredBy"       = EXCLUDED."triggeredBy",
            "updatedAt"         = EXCLUDED."updatedAt"
        WHERE (
          w3ads."WorkspaceSyncState"."lastSyncedAt" IS NULL
          OR w3ads."WorkspaceSyncState"."lastSyncedAt" < ${cooldownCutoff}
        )
        AND (
          w3ads."WorkspaceSyncState"."lastSyncStartedAt" IS NULL
          OR w3ads."WorkspaceSyncState"."lastSyncStartedAt" < ${lockCutoff}
        )
      RETURNING "workspaceId"
    `,
  );

  if (claimedRows.length === 0) {
    const current = await prisma.workspaceSyncState.findUnique({
      where: { workspaceId: input.workspaceId },
      select: { lastSyncedAt: true, lastSyncStartedAt: true },
    });
    if (
      current?.lastSyncStartedAt &&
      current.lastSyncStartedAt.getTime() > lockCutoff.getTime()
    ) {
      return { triggered: false, reason: "locked" };
    }
    return { triggered: false, reason: "cooldown" };
  }

  const runner = input.runner ?? defaultRunner;

  try {
    await runner(input.workspaceId, input.triggeredBy, { includeBackfill });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(
      `[sync-orchestrator] runWorkspaceSync failed workspace=${input.workspaceId}: ${message}`,
    );
  }

  return { triggered: true, reason: "claimed" };
}

async function defaultRunner(
  workspaceId: string,
  _triggeredBy: string,
  options: { includeBackfill: boolean },
) {
  await runWorkspaceSync(workspaceId, options);
}

/**
 * Runs sync across every ACTIVE connector of the workspace.
 * Failures per-connector are recorded but do not abort the loop.
 * Always releases the lock and updates `lastSyncedAt` in the `finally` block.
 */
export async function runWorkspaceSync(
  workspaceId: string,
  options: { includeBackfill?: boolean } = {},
): Promise<void> {
  const includeBackfill = options.includeBackfill ?? true;
  let aggregateError: string | null = null;
  const startedAt = Date.now();

  console.info(`[sync-orchestrator] start workspace=${workspaceId}`);
  Sentry.addBreadcrumb({
    category: "sync",
    level: "info",
    message: "runWorkspaceSync start",
    data: { workspaceId },
  });

  try {
    const accounts = await prisma.connectorAccount.findMany({
      where: { workspaceId, status: ConnectorStatus.ACTIVE },
      select: {
        id: true,
        provider: true,
        historicalSyncedAt: true,
        historicalBackfillUntil: true,
      },
    });

    const errors: string[] = [];
    // Workspace-wide wall-clock deadline. Foreground sync is small (current
    // month only) so most accounts finish in seconds, leaving the bulk of
    // the budget for background backfill batches.
    const deadline = Date.now() + 240_000;

    for (const account of accounts) {
      const helper = SYNC_HELPERS[account.provider];
      if (!helper) continue;

      // Phase 1 — Foreground: current UTC month → today.
      try {
        await helper({
          connectorAccountId: account.id,
          range: computeForegroundRange(),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        errors.push(`${account.provider} foreground: ${message}`);
      }

      if (!includeBackfill || Date.now() > deadline) continue;

      // Phase 2 — Background backfill: next 3-month slice walking
      // backwards through history. Stops when 3y window reached.
      const batch = computeBackfillBatch({
        historicalSyncedAt: account.historicalSyncedAt,
        historicalBackfillUntil: account.historicalBackfillUntil,
      });
      if (!batch) {
        // Already done — nothing to do.
        continue;
      }

      try {
        await helper({ connectorAccountId: account.id, range: batch });
        const newUntil = new Date(batch.since);
        await prisma.connectorAccount.update({
          where: { id: account.id },
          data: { historicalBackfillUntil: newUntil },
        });

        // If the next computed batch would be null, the cursor reached the
        // 3-year target — mark history complete and stop the loop here.
        const next = computeBackfillBatch({
          historicalSyncedAt: account.historicalSyncedAt,
          historicalBackfillUntil: newUntil,
        });
        if (!next) {
          await prisma.connectorAccount.update({
            where: { id: account.id },
            data: { historicalSyncedAt: new Date() },
          });
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        errors.push(`${account.provider} backfill: ${message}`);
      }
    }

    if (errors.length > 0) {
      aggregateError = errors.join(" | ").slice(0, 1000);
    }
  } catch (err: unknown) {
    aggregateError = err instanceof Error ? err.message : "unknown";
    Sentry.captureException(err, {
      tags: { module: "sync-orchestrator", workspaceId },
    });
  } finally {
    await prisma.workspaceSyncState.update({
      where: { workspaceId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStartedAt: null,
        lastSyncStatus: aggregateError ? "FAILED" : "SUCCESS",
        lastSyncError: aggregateError,
        syncCount: { increment: 1 },
      },
    });
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    console.info(
      `[sync-orchestrator] done workspace=${workspaceId} elapsed=${elapsedSec}s status=${
        aggregateError ? "FAILED" : "SUCCESS"
      }`,
    );
    Sentry.addBreadcrumb({
      category: "sync",
      level: aggregateError ? "error" : "info",
      message: "runWorkspaceSync done",
      data: {
        workspaceId,
        elapsedSec,
        status: aggregateError ? "FAILED" : "SUCCESS",
      },
    });
  }
}
