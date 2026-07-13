import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";
import { NonRetriableError, RetryAfterError } from "inngest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMocks } = vi.hoisted(() => ({
  prismaMocks: {
    connectorAccount: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    syncJob: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: prismaMocks,
}));

import {
  createSyncJob,
  recoverOrphanedSyncJobs,
  recoverTransientSyncErrors,
  recordSyncFailure,
  recordSyncSuccess,
  throwClassifiedSyncFailure,
} from "@/lib/jobs/sync-operations";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMocks.connectorAccount.update.mockImplementation((input) => input);
  prismaMocks.syncJob.create.mockResolvedValue({ id: "job-1" });
  prismaMocks.syncJob.update.mockImplementation((input) => input);
  prismaMocks.syncJob.updateMany.mockResolvedValue({ count: 0 });
  prismaMocks.$transaction.mockResolvedValue([]);
  prismaMocks.$transaction.mockImplementation(async (operations) => {
    if (typeof operations === "function") {
      return operations({
        connectorAccount: { update: prismaMocks.connectorAccount.update },
        syncJob: { create: prismaMocks.syncJob.create },
      });
    }
    return Promise.all(operations);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recoverTransientSyncErrors", () => {
  it("reactivates only legacy ERROR connectors with known outage failures", async () => {
    prismaMocks.connectorAccount.findMany.mockResolvedValue([
      {
        id: "outage",
        lastSyncError: "HTTP 503 from provider",
        syncFailureCount: 2,
      },
      {
        id: "token",
        lastSyncError: "refresh token expired",
        syncFailureCount: 4,
      },
      {
        id: "unknown",
        lastSyncError: "manual configuration error",
        syncFailureCount: 0,
      },
    ]);
    const now = new Date("2026-07-13T12:00:00.000Z");

    await expect(recoverTransientSyncErrors(now)).resolves.toEqual({ count: 1 });

    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledWith({
      where: { id: "outage" },
      data: {
        status: ConnectorStatus.ACTIVE,
        syncFailureCount: 2,
        syncRetryAt: now,
      },
    });
    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledTimes(1);
    expect(prismaMocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not write when no recoverable ERROR connectors exist", async () => {
    prismaMocks.connectorAccount.findMany.mockResolvedValue([
      {
        id: "token",
        lastSyncError: "HTTP 401 invalid access token",
        syncFailureCount: 1,
      },
    ]);

    await expect(recoverTransientSyncErrors()).resolves.toEqual({ count: 0 });
    expect(prismaMocks.connectorAccount.update).not.toHaveBeenCalled();
    expect(prismaMocks.$transaction).not.toHaveBeenCalled();
  });

  it("records a successful job and clears the retry state atomically", async () => {
    await recordSyncSuccess({
      connectorAccountId: "connector-1",
      syncJobId: "job-1",
      rowsUpdated: 12,
    });

    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "connector-1" },
        data: expect.objectContaining({
          status: ConnectorStatus.ACTIVE,
          syncFailureCount: 0,
          syncRetryAt: null,
          lastSyncError: null,
        }),
      }),
    );
    expect(prismaMocks.syncJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: expect.objectContaining({
        status: SyncStatus.SUCCESS,
        rowsUpdated: 12,
      }),
    });
    expect(prismaMocks.$transaction).toHaveBeenCalledTimes(1);
  });

  it("records transient failures as ACTIVE with a bounded retry timestamp", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    const result = await recordSyncFailure({
      connectorAccountId: "connector-1",
      syncJobId: "job-1",
      previousFailureCount: 1,
      error: new Error("HTTP 503 from provider"),
    });

    expect(result.kind).toBe("TRANSIENT");
    expect(result.failureCount).toBe(2);
    expect(result.retryAt).toBeInstanceOf(Date);
    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ConnectorStatus.ACTIVE,
          syncFailureCount: 2,
          lastSyncError: "HTTP 503 from provider",
        }),
      }),
    );
    expect(prismaMocks.syncJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SyncStatus.FAILED,
          errorMessage: "HTTP 503 from provider",
        }),
      }),
    );
  });

  it("records permanent failures as blocked connectors without a retry", async () => {
    const result = await recordSyncFailure({
      connectorAccountId: "connector-1",
      syncJobId: "job-1",
      previousFailureCount: 0,
      error: new Error("HTTP 401 invalid access token"),
    });

    expect(result).toEqual({
      kind: "PERMANENT",
      status: ConnectorStatus.TOKEN_EXPIRED,
      failureCount: 1,
      retryAt: null,
    });
    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ConnectorStatus.TOKEN_EXPIRED,
          syncRetryAt: null,
        }),
      }),
    );
  });

  it("maps the recorded classification to Inngest retry semantics", () => {
    expect(() =>
      throwClassifiedSyncFailure({
        classification: {
          kind: "PERMANENT",
          status: ConnectorStatus.ERROR,
          failureCount: 1,
          retryAt: null,
        },
        message: "invalid configuration",
        cause: new Error("invalid configuration"),
      }),
    ).toThrow(NonRetriableError);

    const retryAt = new Date("2026-07-13T12:05:00.000Z");
    expect(() =>
      throwClassifiedSyncFailure({
        classification: {
          kind: "TRANSIENT",
          failureCount: 1,
          retryAt,
        },
        message: "provider unavailable",
        cause: new Error("provider unavailable"),
      }),
    ).toThrow(RetryAfterError);
  });

  it("marks stale RUNNING jobs as failed for the next run to replace", async () => {
    prismaMocks.syncJob.updateMany.mockResolvedValueOnce({ count: 3 });
    const now = new Date("2026-07-13T12:00:00.000Z");

    await expect(recoverOrphanedSyncJobs(now)).resolves.toEqual({ count: 3 });
    expect(prismaMocks.syncJob.updateMany).toHaveBeenCalledWith({
      where: {
        status: SyncStatus.RUNNING,
        startedAt: { lt: new Date("2026-07-13T11:50:00.000Z") },
      },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: now,
        errorMessage: "Sync interrompido antes de concluir; reprocessamento agendado.",
      },
    });
  });

  it("creates a RUNNING job and records the attempt in one transaction", async () => {
    const result = await createSyncJob({
      connector: {
        id: "connector-1",
        workspaceId: "workspace-1",
        provider: ConnectorProvider.SHOPIFY,
      },
      syncType: "INCREMENTAL",
      metadata: { since: "2026-07-13", until: "2026-07-13" },
    });

    expect(result).toEqual({ id: "job-1" });
    expect(prismaMocks.syncJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        connectorAccountId: "connector-1",
        status: SyncStatus.RUNNING,
        syncType: "INCREMENTAL",
      }),
    });
    expect(prismaMocks.connectorAccount.update).toHaveBeenCalledWith({
      where: { id: "connector-1" },
      data: expect.objectContaining({ lastSyncAttemptedAt: expect.any(Date) }),
    });
  });
});
