import {
  ConnectorProvider,
  ConnectorStatus,
  SyncStatus,
  type ConnectorAccount,
  type Prisma,
} from "@prisma/client";
import { NonRetriableError, RetryAfterError } from "inngest";

import {
  buildConnectorBackfillEvent,
  type ConnectorBackfillEvent,
  type ConnectorSyncType,
} from "@/lib/connectors/backfill";
import {
  classifySyncFailure,
  isKnownTransientSyncFailure,
  nextSyncRetryAt,
  type SyncFailureClassification,
} from "@/lib/connectors/sync-failure";
import { prisma } from "@/lib/db/prisma";

export const ORPHANED_SYNC_JOB_MS = 10 * 60 * 1000;

export type ProductionSyncType = ConnectorSyncType;

type SyncableConnector = Pick<ConnectorAccount, "id" | "provider" | "status">;
type SyncJobConnector = Pick<
  ConnectorAccount,
  "id" | "workspaceId" | "provider"
>;

const adsProviders = new Set<ConnectorProvider>([
  ConnectorProvider.META_ADS,
  ConnectorProvider.GOOGLE_ADS,
]);
const analyticsProviders = new Set<ConnectorProvider>([ConnectorProvider.GA4]);

const ecommerceProviders = new Set<ConnectorProvider>([
  ConnectorProvider.SHOPIFY,
  ConnectorProvider.NUVEMSHOP,
  ConnectorProvider.ISET,
  ConnectorProvider.TRAY,
  ConnectorProvider.WBUY,
  ConnectorProvider.MAGAZORD,
  ConnectorProvider.GOOGLE_SHEETS,
  ConnectorProvider.LOJA_INTEGRADA,
]);

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildIncrementalSyncRange(
  provider: ConnectorProvider,
  now = new Date(),
) {
  const until = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const since = new Date(until);
  since.setUTCDate(
    since.getUTCDate() -
      (adsProviders.has(provider) || analyticsProviders.has(provider) ? 7 : 3),
  );

  return {
    since: dateOnly(since),
    until: dateOnly(until),
  };
}

export function isSyncableProvider(provider: ConnectorProvider) {
  return (
    adsProviders.has(provider) ||
    analyticsProviders.has(provider) ||
    ecommerceProviders.has(provider)
  );
}

export function buildSyncRunEvents(input: {
  connectors: SyncableConnector[];
  now?: Date;
}): ConnectorBackfillEvent[] {
  return input.connectors
    .filter((connector) => connector.status === ConnectorStatus.ACTIVE)
    .filter((connector) => isSyncableProvider(connector.provider))
    .map((connector) =>
      buildConnectorBackfillEvent({
        provider: connector.provider,
        connectorAccountId: connector.id,
        range: buildIncrementalSyncRange(connector.provider, input.now),
        syncType: "INCREMENTAL",
      }),
    );
}

export function buildSyncJobCreateInput(input: {
  connector: SyncJobConnector;
  syncType: ProductionSyncType;
  cursor?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  return {
    connectorAccountId: input.connector.id,
    workspaceId: input.connector.workspaceId,
    provider: input.connector.provider,
    syncType: input.syncType,
    cursor: input.cursor ?? null,
    status: SyncStatus.RUNNING,
    metadata: input.metadata ?? undefined,
  };
}

export async function createSyncJob(input: {
  connector: SyncJobConnector;
  syncType: ProductionSyncType;
  metadata?: Prisma.InputJsonValue;
}) {
  const startedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const syncJob = await tx.syncJob.create({
      data: buildSyncJobCreateInput(input),
    });

    await tx.connectorAccount.update({
      where: { id: input.connector.id },
      data: { lastSyncAttemptedAt: startedAt },
    });

    return syncJob;
  });
}

export async function recordSyncSuccess(input: {
  connectorAccountId: string;
  syncJobId: string;
  rowsUpdated: number;
  lastSyncError?: string | null;
}) {
  const completedAt = new Date();

  await prisma.$transaction([
    prisma.connectorAccount.update({
      where: { id: input.connectorAccountId },
      data: {
        lastSyncedAt: completedAt,
        lastSyncAttemptedAt: completedAt,
        lastSyncError: input.lastSyncError ?? null,
        status: ConnectorStatus.ACTIVE,
        syncFailureCount: 0,
        syncRetryAt: null,
      },
    }),
    prisma.syncJob.update({
      where: { id: input.syncJobId },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: completedAt,
        rowsUpdated: input.rowsUpdated,
      },
    }),
  ]);
}

export async function recordSyncFailure(input: {
  connectorAccountId: string;
  syncJobId: string;
  previousFailureCount: number;
  error: unknown;
  message?: string;
}) {
  const classification = classifySyncFailure(input.error);
  const now = new Date();
  const failureCount = Math.max(0, input.previousFailureCount) + 1;
  const retryAt =
    classification.kind === "TRANSIENT"
      ? nextSyncRetryAt(now, failureCount)
      : null;
  const message = (input.message ??
    (input.error instanceof Error
      ? input.error.message
      : String(input.error))).slice(0, 2000);

  await prisma.$transaction([
    prisma.connectorAccount.update({
      where: { id: input.connectorAccountId },
      data: {
        status:
          classification.kind === "TRANSIENT"
            ? ConnectorStatus.ACTIVE
            : (classification.status ?? ConnectorStatus.ERROR),
        lastSyncAttemptedAt: now,
        lastSyncError: message,
        syncFailureCount: failureCount,
        syncRetryAt: retryAt,
      },
    }),
    prisma.syncJob.update({
      where: { id: input.syncJobId },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: now,
        errorMessage: message,
      },
    }),
  ]);

  return { ...classification, failureCount, retryAt };
}

export type RecordedSyncFailure = SyncFailureClassification & {
  failureCount: number;
  retryAt: Date | null;
};

export function throwClassifiedSyncFailure(input: {
  classification: RecordedSyncFailure;
  message: string;
  cause: unknown;
}): never {
  if (input.classification.kind === "PERMANENT") {
    throw new NonRetriableError(input.message, { cause: input.cause });
  }

  if (input.classification.retryAt) {
    throw new RetryAfterError(input.message, input.classification.retryAt, {
      cause: input.cause,
    });
  }

  throw input.cause instanceof Error ? input.cause : new Error(input.message);
}

export async function recoverOrphanedSyncJobs(now = new Date()) {
  const cutoff = new Date(now.getTime() - ORPHANED_SYNC_JOB_MS);

  return prisma.syncJob.updateMany({
    where: {
      status: SyncStatus.RUNNING,
      startedAt: { lt: cutoff },
    },
    data: {
      status: SyncStatus.FAILED,
      finishedAt: now,
      errorMessage: "Sync interrompido antes de concluir; reprocessamento agendado.",
    },
  });
}

/**
 * One-time-safe recovery for connectors left in ERROR by the old all-errors
 * policy. Only explicit transport/provider outage errors are reactivated;
 * token, permission, configuration, and unknown errors stay blocked.
 */
export async function recoverTransientSyncErrors(now = new Date()) {
  const erroredConnectors = await prisma.connectorAccount.findMany({
    where: {
      status: ConnectorStatus.ERROR,
      lastSyncError: { not: null },
    },
    select: {
      id: true,
      lastSyncError: true,
      syncFailureCount: true,
    },
  });

  const recoverable = erroredConnectors.filter((connector) =>
    isKnownTransientSyncFailure(connector.lastSyncError),
  );

  if (recoverable.length === 0) {
    return { count: 0 };
  }

  await prisma.$transaction(
    recoverable.map((connector) =>
      prisma.connectorAccount.update({
        where: { id: connector.id },
        data: {
          status: ConnectorStatus.ACTIVE,
          syncFailureCount: Math.max(1, connector.syncFailureCount),
          syncRetryAt: now,
        },
      }),
    ),
  );

  return { count: recoverable.length };
}
