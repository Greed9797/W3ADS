import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";
import Decimal from "decimal.js";

import { isApprovedOrderStatus } from "@/lib/metrics/order-status";
import { IsetClient } from "@/lib/connectors/iset/client";
import { normalizeManualCommerceOrder } from "@/lib/connectors/manual-commerce";
import {
  connectorAccessTokenFromAccount,
  connectorCredentialsFromAccountVaultAware,
} from "@/lib/connectors/credentials";
import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import { ShopifyClient } from "@/lib/connectors/shopify/client";
import {
  buildNuvemshopConfigFromProviderConfig,
  buildShopifyConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";
import type { ShopifyOrder } from "@/lib/connectors/shopify/client";
import { prisma } from "@/lib/db/prisma";
import {
  buildSyncJobCreateInput,
  type ProductionSyncType,
} from "@/lib/jobs/sync-operations";

import { ManualCommerceClient } from "./manual-commerce-client";

export type EcommerceSyncRange = {
  since: string;
  until: string;
};

const ORDER_PERSIST_CONCURRENCY = 5;

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

function asDateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function ecommerceDailyDedupeHash(input: {
  workspaceId: string;
  connectorAccountId: string;
  provider: ConnectorProvider;
  date: string;
}) {
  return createHash("sha256")
    .update(
      [
        input.workspaceId,
        input.connectorAccountId,
        input.provider,
        input.date,
      ].join(":"),
    )
    .digest("hex");
}

export function mapEcommerceOrdersToDailyMetricSummaries(input: {
  workspaceId: string;
  connectorAccountId: string;
  provider: ConnectorProvider;
  orders: ShopifyOrder[];
}) {
  const byDay = new Map<string, { revenue: Decimal; orders: number }>();

  for (const order of input.orders) {
    if (!isApprovedOrderStatus(order.status)) continue;
    const day = order.placedAt.slice(0, 10);
    const current = byDay.get(day) ?? { revenue: new Decimal(0), orders: 0 };
    current.revenue = current.revenue.plus(order.orderTotal);
    current.orders +=
      input.provider === ConnectorProvider.GOOGLE_SHEETS
        ? Math.max(0, order.itemsCount)
        : 1;
    byDay.set(day, current);
  }

  return Array.from(byDay.entries()).map(([day, summary]) => ({
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    date: asDateOnly(day),
    day,
    source: input.provider,
    revenue: summary.revenue.toFixed(2),
    orders: BigInt(summary.orders),
    dedupeHash: ecommerceDailyDedupeHash({
      workspaceId: input.workspaceId,
      connectorAccountId: input.connectorAccountId,
      provider: input.provider,
      date: day,
    }),
  }));
}

export function mapEcommerceOrderToRecord(input: {
  workspaceId: string;
  connectorAccountId: string;
  provider: ConnectorProvider;
  order: ShopifyOrder;
}) {
  const placedAt = parsePlacedAt(input.order.placedAt);
  if (placedAt === null) {
    return null;
  }
  return {
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    externalOrderId: input.order.externalOrderId,
    platform: input.provider,
    orderNumber: input.order.orderNumber,
    customerEmail: input.order.customerEmail,
    orderTotal: input.order.orderTotal,
    orderCurrency: input.order.orderCurrency,
    itemsCount: input.order.itemsCount,
    status: input.order.status,
    shippingState: input.order.shippingState,
    utmSource: input.order.utmSource,
    utmMedium: input.order.utmMedium,
    utmCampaign: input.order.utmCampaign,
    placedAt,
  };
}

/**
 * Defensive guard against upstream providers returning malformed or empty
 * timestamps (e.g., MySQL "0000-00-00" or refund-only rows). Returns null on
 * invalid input — callers must skip the order (storing `now` would silently
 * inflate today's metrics with phantom orders).
 */
function parsePlacedAt(value: string): Date | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? new Date(ts) : null;
}

function mapEcommerceOrderItemsToRecords(input: {
  workspaceId: string;
  connectorAccountId: string;
  ecommerceOrderId: string;
  order: ShopifyOrder;
  placedAt: Date;
}) {
  return (input.order.items ?? []).map((item) => ({
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    ecommerceOrderId: input.ecommerceOrderId,
    externalOrderId: input.order.externalOrderId,
    productName: item.productName,
    sku: item.sku,
    quantity: item.quantity,
    total: item.total,
    placedAt: input.placedAt,
  }));
}

async function persistEcommerceOrders(input: {
  workspaceId: string;
  connectorAccountId: string;
  provider: ConnectorProvider;
  orders: ShopifyOrder[];
}) {
  let skippedInvalidDate = 0;
  const ingestedOrders: ShopifyOrder[] = [];
  const validOrders: Array<{
    order: ShopifyOrder;
    payload: NonNullable<ReturnType<typeof mapEcommerceOrderToRecord>>;
  }> = [];

  for (const order of input.orders) {
    const payload = mapEcommerceOrderToRecord({ ...input, order });
    if (payload === null) {
      skippedInvalidDate += 1;
      continue;
    }

    validOrders.push({ order, payload });
  }

  for (const batch of chunks(validOrders, ORDER_PERSIST_CONCURRENCY)) {
    await Promise.all(
      batch.map(async ({ order, payload }) => {
        await prisma.$transaction(async (tx) => {
          const savedOrder = await tx.ecommerceOrder.upsert({
            where: {
              connectorAccountId_externalOrderId: {
                connectorAccountId: input.connectorAccountId,
                externalOrderId: order.externalOrderId,
              },
            },
            update: payload,
            create: payload,
          });
          const itemPayloads = mapEcommerceOrderItemsToRecords({
            workspaceId: input.workspaceId,
            connectorAccountId: input.connectorAccountId,
            ecommerceOrderId: savedOrder.id,
            order,
            placedAt: payload.placedAt,
          });

          await tx.ecommerceOrderItem.deleteMany({
            where: {
              connectorAccountId: input.connectorAccountId,
              externalOrderId: order.externalOrderId,
            },
          });

          if (itemPayloads.length) {
            await tx.ecommerceOrderItem.createMany({
              data: itemPayloads,
            });
          }
        });
        ingestedOrders.push(order);
      }),
    );
  }

  if (skippedInvalidDate > 0) {
    console.warn(
      `[ecommerce-sync] skipped ${skippedInvalidDate} orders with invalid placedAt (provider=${input.provider} workspaceId=${input.workspaceId})`,
    );
  }

  const summaries = mapEcommerceOrdersToDailyMetricSummaries({
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    provider: input.provider,
    orders: ingestedOrders,
  });
  for (const summary of summaries) {
    await prisma.dailyMetric.upsert({
      where: { dedupeHash: summary.dedupeHash },
      update: {
        revenue: summary.revenue,
        orders: summary.orders,
      },
      create: {
        workspaceId: input.workspaceId,
        connectorAccountId: input.connectorAccountId,
        date: summary.date,
        source: input.provider,
        revenue: summary.revenue,
        orders: summary.orders,
        dedupeHash: summary.dedupeHash,
      },
    });
  }
}

async function loadOrdersForConnector(input: {
  provider: ConnectorProvider;
  connectorAccountId: string;
  accessToken?: string;
  range: EcommerceSyncRange;
}) {
  const connector = await prisma.connectorAccount.findUniqueOrThrow({
    where: { id: input.connectorAccountId },
  });

  if (input.provider === ConnectorProvider.NUVEMSHOP) {
    if (!input.accessToken) {
      throw new Error("Nuvemshop access token is missing");
    }
    const providerConfig = await getActiveProviderConfig({
      workspaceId: connector.workspaceId,
      provider: ConnectorProvider.NUVEMSHOP,
    });
    if (!providerConfig) {
      throw new Error("Nuvemshop provider config is missing");
    }
    const client = new NuvemshopClient({
      config: await buildNuvemshopConfigFromProviderConfig(providerConfig),
    });

    return client.listOrders({
      storeId: connector.externalAccountId,
      accessToken: input.accessToken,
      since: input.range.since,
      until: input.range.until,
    });
  }

  if (input.provider === ConnectorProvider.SHOPIFY) {
    const providerConfig = await getActiveProviderConfig({
      workspaceId: connector.workspaceId,
      provider: ConnectorProvider.SHOPIFY,
    });
    if (!providerConfig) {
      throw new Error("Shopify provider config is missing");
    }
    const credentials =
      await connectorCredentialsFromAccountVaultAware(connector);
    const accessToken =
      typeof credentials.accessToken === "string"
        ? credentials.accessToken
        : null;
    if (!accessToken) {
      throw new Error("Shopify access token is missing");
    }
    const config = await buildShopifyConfigFromProviderConfig(providerConfig);
    const client = new ShopifyClient({ config });
    return client.listOrders({
      shop: connector.externalAccountId,
      accessToken,
      since: input.range.since,
      until: input.range.until,
    });
  }

  if (input.provider === ConnectorProvider.ISET) {
    const isetCredentials =
      await connectorCredentialsFromAccountVaultAware(connector);
    const asText = (key: string) => {
      const value = isetCredentials[key];
      return typeof value === "string" ? value.trim() : "";
    };
    const client = new IsetClient({
      config: {
        baseUrl: asText("baseUrl"),
        identifier: asText("apiUser"),
        secret: asText("apiKey") || asText("apiSecret"),
      },
    });
    return client.listOrders({
      since: input.range.since,
      until: input.range.until,
    });
  }

  const credentials =
    await connectorCredentialsFromAccountVaultAware(connector);
  const manualClient = new ManualCommerceClient({
    provider: input.provider,
    credentials,
  });
  const payloads = await manualClient.listOrders(input.range);

  return payloads.map(normalizeManualCommerceOrder);
}

export async function syncEcommerceOrders(input: {
  connectorAccountId: string;
  range: EcommerceSyncRange;
  syncType?: ProductionSyncType;
}) {
  const connector = await prisma.connectorAccount.findUniqueOrThrow({
    where: { id: input.connectorAccountId },
  });
  const syncJob = await prisma.syncJob.create({
    data: buildSyncJobCreateInput({
      connector,
      syncType: input.syncType ?? "BACKFILL",
      metadata: input.range,
    }),
  });

  try {
    const accessToken =
      connector.provider === ConnectorProvider.NUVEMSHOP
        ? await connectorAccessTokenFromAccount(connector)
        : undefined;
    const orders = await loadOrdersForConnector({
      provider: connector.provider,
      connectorAccountId: connector.id,
      accessToken,
      range: input.range,
    });

    await persistEcommerceOrders({
      workspaceId: connector.workspaceId,
      connectorAccountId: connector.id,
      provider: connector.provider,
      orders,
    });

    await prisma.connectorAccount.update({
      where: { id: connector.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
        status: ConnectorStatus.ACTIVE,
      },
    });
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        rowsUpdated: orders.length,
      },
    });

    return { rowsUpserted: orders.length };
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : "Unknown ecommerce sync error";

    await prisma.connectorAccount.update({
      where: { id: input.connectorAccountId },
      data: {
        status: ConnectorStatus.ERROR,
        lastSyncError: message,
      },
    });
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: message,
      },
    });

    throw caught;
  }
}
