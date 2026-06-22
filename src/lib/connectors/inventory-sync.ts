import { ConnectorProvider, ConnectorStatus } from "@prisma/client";

import { connectorCredentialsFromAccountVaultAware } from "@/lib/connectors/credentials";
import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";
import { prisma } from "@/lib/db/prisma";

/** Providers whose catalog stock the inventory sync can currently pull. */
const INVENTORY_PROVIDERS = new Set<ConnectorProvider>([
  ConnectorProvider.LOJA_INTEGRADA,
]);

export function supportsInventory(provider: ConnectorProvider): boolean {
  return INVENTORY_PROVIDERS.has(provider);
}

// The catalog fetch is heavy (full product list, paginated) and stock changes
// slowly, so re-pull at most this often even when order syncs fire faster
// (e.g. real-time mode every ~5min).
const INVENTORY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Pulls the current per-product stock for one connector and upserts it into
 * ProductInventory (keyed by connectorAccountId + externalProductId, so a
 * re-sync overwrites quantities in place). No-op for providers without an
 * inventory source. Returns how many products were written.
 */
export async function syncConnectorInventory(input: {
  connectorAccountId: string;
}): Promise<{ count: number }> {
  const connector = await prisma.connectorAccount.findUnique({
    where: { id: input.connectorAccountId },
    select: {
      id: true,
      workspaceId: true,
      provider: true,
      status: true,
      externalAccountId: true,
      credentialSecretId: true,
      accessTokenCiphertext: true,
      tokenIv: true,
      tokenAuthTag: true,
      tokenKeyVersion: true,
    },
  });

  if (
    !connector ||
    connector.status !== ConnectorStatus.ACTIVE ||
    !supportsInventory(connector.provider)
  ) {
    return { count: 0 };
  }

  // Cooldown: skip if this connector's inventory was refreshed recently.
  const recent = await prisma.productInventory.findFirst({
    where: { connectorAccountId: connector.id },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  if (
    recent &&
    Date.now() - recent.syncedAt.getTime() < INVENTORY_COOLDOWN_MS
  ) {
    return { count: 0 };
  }

  const credentials =
    await connectorCredentialsFromAccountVaultAware(connector);
  const client = new ManualCommerceClient({
    provider: connector.provider,
    credentials,
  });

  const rows = await client.listInventory();
  const syncedAt = new Date();

  for (const row of rows) {
    await prisma.productInventory.upsert({
      where: {
        connectorAccountId_externalProductId: {
          connectorAccountId: connector.id,
          externalProductId: row.externalProductId,
        },
      },
      update: {
        sku: row.sku,
        productName: row.productName,
        quantity: row.quantity,
        syncedAt,
      },
      create: {
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        externalProductId: row.externalProductId,
        sku: row.sku,
        productName: row.productName,
        quantity: row.quantity,
      },
    });
  }

  return { count: rows.length };
}
