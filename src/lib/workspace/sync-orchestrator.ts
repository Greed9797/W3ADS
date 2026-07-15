import { randomUUID } from "node:crypto";

import { ConnectorProvider, ConnectorStatus, Prisma } from "@prisma/client";
import * as Sentry from "@sentry/nextjs";

import { prisma } from "@/lib/db/prisma";
import { SYNC_HELPERS } from "@/lib/connectors/sync-helpers";
import {
  backfillBatchMonthsFor,
  computeBackfillBatch,
  computeForegroundRange,
} from "@/lib/connectors/sync-range";

/**
 * Worst-case time to reserve for a single 3-month backfill batch per provider,
 * so the loop never starts a batch it can't finish before the deadline. Meta
 * /insights chunks 14-day windows and can run up to its own ~240s internal
 * deadline; e-commerce and Google are far lighter.
 */
function estimatedBatchMs(provider: ConnectorProvider): number {
  switch (provider) {
    case ConnectorProvider.META_ADS:
      return 240_000;
    case ConnectorProvider.GOOGLE_ADS:
    case ConnectorProvider.GA4:
      return 90_000;
    default:
      return 30_000;
  }
}

export const COOLDOWN_MS = 30 * 60 * 1000; // 30min on-login
// 30min: the external scheduler (GitHub Actions) hits the cron route every
// 15min, so a workspace goes at most ~45min without sync. 90min only made
// sense when the Vercel daily cron was the sole background trigger.
export const BACKGROUND_THRESHOLD_MS = 30 * 60 * 1000;
export const LOCK_STALE_MS = 5 * 60 * 1000; // 5min — release stuck locks fast
// After a FAILED sync, lastSyncedAt is backdated so the workspace becomes
// stale again this soon — the 15-min scheduler then retries naturally instead
// of waiting out the full threshold ("a failure must not count as a sync").
export const RETRY_DELAY_MS = 10 * 60 * 1000;

type SyncRunStatus = "SUCCESS" | "FAILED" | "PARTIAL";

export type WorkspaceSyncResult = {
  status: SyncRunStatus;
  errors: string[];
  skippedForRetry: number;
};

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
  /**
   * Absolute wall-clock ceiling (epoch ms). A sync claimed late in a cron run
   * must not outlive the serverless function (300s) — past this instant the
   * sync stops claiming new batches and releases the lock normally.
   */
  deadlineAt?: number;
  /** Internal hook to keep tests deterministic — defaults to fire-and-forget `void`. */
  runner?: (
    workspaceId: string,
    triggeredBy: string,
    options: {
      includeBackfill: boolean;
      deadlineAt?: number;
      ignoreRetryBackoff?: boolean;
    },
  ) => Promise<void> | void;
  ignoreRetryBackoff?: boolean;
};

function eligibleConnectorWhere(now: Date): Prisma.ConnectorAccountWhereInput {
  return {
    status: ConnectorStatus.ACTIVE,
    OR: [{ syncRetryAt: null }, { syncRetryAt: { lte: now } }],
  };
}

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
    where: {
      workspaceId: input.workspaceId,
      ...(input.ignoreRetryBackoff
        ? { status: ConnectorStatus.ACTIVE }
        : eligibleConnectorWhere(now)),
    },
  });
  if (activeCount === 0) {
    return { triggered: false, reason: "no_active_connectors" };
  }

  // Atomic insert-or-claim: single round-trip that creates the row on first
  // call and only claims when cooldown passed AND no fresh lock. The conditional
  // sits inside ON CONFLICT DO UPDATE, so two concurrent callers can never both
  // claim — Postgres serializes the row-level update.
  const claimId = randomUUID();
  const claimedRows = await prisma.$queryRaw<Array<{ workspaceId: string }>>(
    Prisma.sql`
      INSERT INTO w3ads."WorkspaceSyncState" (
        "id", "workspaceId", "lastSyncStartedAt", "lastSyncStatus",
        "triggeredBy", "syncCount", "updatedAt"
      )
      VALUES (
        ${claimId}, ${input.workspaceId}, ${now}, 'IN_PROGRESS',
        ${input.triggeredBy}, 0, ${now}
      )
      ON CONFLICT ("workspaceId") DO UPDATE
        SET "lastSyncStartedAt" = EXCLUDED."lastSyncStartedAt",
            "lastSyncStatus"    = EXCLUDED."lastSyncStatus",
            "triggeredBy"       = EXCLUDED."triggeredBy",
            "updatedAt"         = EXCLUDED."updatedAt",
            -- Claiming over a still-set (expired) lock means the previous run
            -- was killed before its finally block (maxDuration). Leave a trace:
            -- if this run also dies, the row keeps this error + a stale
            -- lastSyncStartedAt, which the health banner surfaces.
            "lastSyncError" = CASE
              WHEN w3ads."WorkspaceSyncState"."lastSyncStartedAt" IS NOT NULL
                THEN 'sync anterior interrompido antes de concluir (timeout da função)'
              ELSE w3ads."WorkspaceSyncState"."lastSyncError"
            END
        WHERE (
          w3ads."WorkspaceSyncState"."lastSyncedAt" IS NULL
          OR w3ads."WorkspaceSyncState"."lastSyncedAt" < ${cooldownCutoff}
          OR w3ads."WorkspaceSyncState"."lastSyncStatus" IN ('FAILED', 'PARTIAL')
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
    await runner(input.workspaceId, input.triggeredBy, {
      includeBackfill,
      deadlineAt: input.deadlineAt,
      ...(input.ignoreRetryBackoff ? { ignoreRetryBackoff: true } : {}),
    });
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
  options: {
    includeBackfill: boolean;
    deadlineAt?: number;
    ignoreRetryBackoff?: boolean;
  },
) {
  await runWorkspaceSync(workspaceId, options);
}

/**
 * Runs sync across every ACTIVE connector of the workspace.
 * Failures per-connector are recorded but do not abort the loop.
 * Always releases the lock. `lastSyncedAt` advances only after a full success.
 */
export async function runWorkspaceSync(
  workspaceId: string,
  options: {
    includeBackfill?: boolean;
    deadlineAt?: number;
    ignoreRetryBackoff?: boolean;
  } = {},
): Promise<WorkspaceSyncResult> {
  const includeBackfill = options.includeBackfill ?? true;
  const errors: string[] = [];
  let skippedForRetry = 0;
  let status: SyncRunStatus = "SUCCESS";
  const startedAt = Date.now();

  console.info(`[sync-orchestrator] start workspace=${workspaceId}`);
  Sentry.addBreadcrumb({
    category: "sync",
    level: "info",
    message: "runWorkspaceSync start",
    data: { workspaceId },
  });

  try {
    const now = new Date();
    const accounts = await prisma.connectorAccount.findMany({
      where: { workspaceId, status: ConnectorStatus.ACTIVE },
      select: {
        id: true,
        provider: true,
        syncRetryAt: true,
        syncFailureCount: true,
        historicalSyncedAt: true,
        historicalBackfillUntil: true,
      },
    });

    const eligibleAccounts = options.ignoreRetryBackoff
      ? accounts
      : accounts.filter(
          (account) =>
            !account.syncRetryAt || account.syncRetryAt.getTime() <= now.getTime(),
        );
    skippedForRetry = accounts.filter(
      (account) =>
        Boolean(account.syncRetryAt) &&
        account.syncRetryAt!.getTime() > now.getTime() &&
        Boolean(SYNC_HELPERS[account.provider]),
    ).length;
    // Hard wall-clock budget, kept ~30s under Vercel's 300s function limit so a
    // batch in flight never gets killed mid-write. A caller-supplied deadlineAt
    // (cron passing down its own remaining budget) tightens this further — a
    // sync claimed late in the cron run gets only what's left, never 270s.
    // 240s: 60s of real headroom under Vercel's 300s kill so helpers that
    // respect the deadline stop in time and the finally block always runs
    // (270s left only 30s — heavy providers overshot it and got killed).
    const hardDeadline = Math.min(
      Date.now() + 240_000,
      options.deadlineAt ?? Number.POSITIVE_INFINITY,
    );

    // Phase 1 — Foreground for every account first (current UTC month → today).
    // These are small/fast, so doing them all up front guarantees the dashboard
    // is current before the (slower) backfill consumes the rest of the budget.
    // FAIR per-account slice (same contract as phase 2): one slow connector
    // must not starve the remaining connectors of the same workspace.
    const syncable = eligibleAccounts.filter((a) => SYNC_HELPERS[a.provider]);
    for (let i = 0; i < syncable.length; i += 1) {
      const account = syncable[i];
      const helper = SYNC_HELPERS[account.provider]!;
      const remainingAccounts = syncable.length - i;
      const fairSlice = Math.floor(
        (hardDeadline - Date.now()) / remainingAccounts,
      );
      const accountDeadline = Math.min(
        hardDeadline,
        Date.now() + Math.max(fairSlice, 0),
      );
      try {
        await helper({
          connectorAccountId: account.id,
          range: computeForegroundRange(),
          // Bound heavy providers (iSET) so a big foreground window can't run
          // past the function limit and get killed (orphaned RUNNING job).
          deadlineMs: accountDeadline,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "unknown";
        errors.push(`${account.provider} foreground: ${message}`);
        Sentry.captureException(err, {
          tags: {
            module: "sync-orchestrator",
            phase: "foreground",
            provider: account.provider,
            connectorAccountId: account.id,
            workspaceId,
          },
        });
      }
    }

    // Phase 2 — Backfill, with a FAIR per-account time slice so one heavy Meta
    // account can't starve the others. Each account walks backwards in 3-month
    // slices; whatever is left resumes next trigger from the persisted cursor.
    if (includeBackfill) {
      const pending = syncable.filter(
        (a) => !(a.historicalSyncedAt && a.historicalBackfillUntil),
      );
      for (let i = 0; i < pending.length; i += 1) {
        const account = pending[i];
        const helper = SYNC_HELPERS[account.provider]!;
        const remainingAccounts = pending.length - i;
        const fairSlice = Math.floor(
          (hardDeadline - Date.now()) / remainingAccounts,
        );
        const accountDeadline = Math.min(
          hardDeadline,
          Date.now() + Math.max(fairSlice, 0),
        );
        // Provider-aware headroom: Meta /insights can run up to its own ~240s
        // internal deadline, so reserve that much; e-commerce/Google are far
        // lighter. We never start a batch we can't finish before the deadline.
        let maxBatchMs = estimatedBatchMs(account.provider);
        const batchMonths = backfillBatchMonthsFor(account.provider);
        let cursor = account.historicalBackfillUntil;
        try {
          while (Date.now() + maxBatchMs < accountDeadline) {
            const batch = computeBackfillBatch({
              historicalSyncedAt: account.historicalSyncedAt,
              historicalBackfillUntil: cursor,
              batchMonths,
            });
            if (!batch) {
              await prisma.connectorAccount.update({
                where: { id: account.id },
                data: { historicalSyncedAt: new Date() },
              });
              break;
            }
            const batchStart = Date.now();
            const result = await helper({
              connectorAccountId: account.id,
              range: batch,
              deadlineMs: accountDeadline,
            });
            maxBatchMs = Math.max(maxBatchMs, Date.now() - batchStart);
            // Heavy provider (iSET) can report the window cut short by the time
            // budget. Do NOT advance the cursor then — the unfetched remainder
            // (tracked by the per-window offset map) must resume next trigger,
            // not be skipped. We're out of budget anyway, so stop.
            if ("complete" in result && result.complete === false) {
              break;
            }
            cursor = new Date(batch.since);
            await prisma.connectorAccount.update({
              where: { id: account.id },
              data: { historicalBackfillUntil: cursor },
            });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "unknown";
          errors.push(`${account.provider} backfill: ${message}`);
          Sentry.captureException(err, {
            tags: {
              module: "sync-orchestrator",
              phase: "backfill",
              provider: account.provider,
              connectorAccountId: account.id,
              workspaceId,
            },
          });
        }
      }
    }

    if (errors.length > 0) {
      status = "FAILED";
    } else if (skippedForRetry > 0) {
      status = "PARTIAL";
    }
  } catch (err: unknown) {
    errors.push(err instanceof Error ? err.message : "unknown");
    status = "FAILED";
    Sentry.captureException(err, {
      tags: { module: "sync-orchestrator", workspaceId },
    });
  } finally {
    // Guard the lock-release write: if this throws (pool exhaustion, transient
    // DB error) the exception must NOT propagate, or `lastSyncStartedAt` stays
    // set and the workspace is locked until the 5-min stale TTL. Surface it to
    // Sentry; the TTL still provides eventual recovery.
    try {
      // A failure must not count as a full sync: backdate lastSyncedAt so the
      // workspace turns stale again in RETRY_DELAY_MS and the 15-min external
      // scheduler retries it, instead of the failure buying a full cooldown.
      const syncedAt =
        status === "SUCCESS"
          ? new Date()
          : new Date(Date.now() - (BACKGROUND_THRESHOLD_MS - RETRY_DELAY_MS));
      await prisma.workspaceSyncState.update({
        where: { workspaceId },
        data: {
          lastSyncedAt: syncedAt,
          lastSyncStartedAt: null,
          lastSyncStatus: status,
          lastSyncError:
            errors.length > 0
              ? errors.join(" | ").slice(0, 1000)
              : skippedForRetry > 0
                ? `${skippedForRetry} connector(s) aguardando retry automático.`
                : null,
          syncCount: { increment: 1 },
        },
      });
    } catch (releaseErr: unknown) {
      console.error(
        `[sync-orchestrator] lock-release failed workspace=${workspaceId}: ${
          releaseErr instanceof Error ? releaseErr.message : "unknown"
        }`,
      );
      Sentry.captureException(releaseErr, {
        tags: { module: "sync-lock-release", workspaceId },
      });
    }
    const elapsedSec = Math.round((Date.now() - startedAt) / 1000);

    console.info(
      `[sync-orchestrator] done workspace=${workspaceId} elapsed=${elapsedSec}s status=${
        status
      }`,
    );
    Sentry.addBreadcrumb({
      category: "sync",
      level: status === "FAILED" ? "error" : "info",
      message: "runWorkspaceSync done",
      data: {
        workspaceId,
        elapsedSec,
        status,
      },
    });
  }

  return {
    status,
    errors,
    skippedForRetry,
  };
}
