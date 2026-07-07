import Link from "next/link";

import { ConnectorStatus } from "@prisma/client";

import { humanizeConnectorSyncError } from "@/lib/connectors/humanize-sync-error";
import { dashboardCommerceProviders } from "@/lib/metrics/period";
import { prisma } from "@/lib/db/prisma";

const STALE_COMMERCE_MS = 2 * 60 * 60 * 1000; // 2h without a sync = stale

function hoursAgo(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(1, Math.round((Date.now() - date.getTime()) / 3_600_000));
}

/**
 * Server component: surfaces broken/stale connectors for the workspace right
 * on the dashboard — the user must not discover a frozen connector by staring
 * at flat numbers. Renders nothing when everything is healthy.
 */
export async function ConnectorHealthBanner({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const staleCutoff = new Date(Date.now() - STALE_COMMERCE_MS);
  const [accounts, syncState] = await Promise.all([
    prisma.connectorAccount.findMany({
      where: {
        workspaceId,
        OR: [
          { status: { not: ConnectorStatus.ACTIVE } },
          { lastSyncError: { not: null } },
          {
            provider: { in: [...dashboardCommerceProviders] },
            OR: [
              { lastSyncedAt: null },
              { lastSyncedAt: { lt: staleCutoff } },
            ],
          },
        ],
      },
      select: {
        id: true,
        accountName: true,
        provider: true,
        status: true,
        lastSyncError: true,
        lastSyncedAt: true,
      },
    }),
    prisma.workspaceSyncState.findUnique({
      where: { workspaceId },
      select: { lastSyncStatus: true, lastSyncError: true },
    }),
  ]);

  const workspaceFailed =
    syncState?.lastSyncStatus === "FAILED" && syncState.lastSyncError;

  if (accounts.length === 0 && !workspaceFailed) {
    return null;
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
    >
      <p className="mb-2 font-semibold text-amber-500">
        ⚠ Sincronização com problemas
      </p>
      <ul className="space-y-1.5">
        {accounts.map((account) => {
          const friendly = account.lastSyncError
            ? humanizeConnectorSyncError(account.lastSyncError, account.provider)
            : null;
          const stale = hoursAgo(account.lastSyncedAt);
          return (
            <li key={account.id} className="text-[var(--text-secondary)]">
              <span className="font-medium text-[var(--text-primary)]">
                {account.accountName}
              </span>{" "}
              {friendly
                ? `— ${friendly.title}. ${friendly.action}`
                : stale
                  ? `— sem sincronizar há ${stale}h.`
                  : "— nunca sincronizou."}
            </li>
          );
        })}
        {workspaceFailed ? (
          <li className="text-[var(--text-secondary)]">
            Última sincronização do workspace falhou: {syncState.lastSyncError}
          </li>
        ) : null}
      </ul>
      <Link
        href="/connectors"
        className="mt-2 inline-block font-medium text-amber-500 underline underline-offset-2"
      >
        Ver conectores
      </Link>
    </div>
  );
}
