import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";
import Decimal from "decimal.js";

import { normalizeManualCommerceOrder } from "@/lib/connectors/manual-commerce";
import { connectorCredentialsFromAccount } from "@/lib/connectors/credentials";
import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import type { ShopifyOrder } from "@/lib/connectors/shopify/client";
import { decryptToken } from "@/lib/crypto/token-vault";
import { prisma } from "@/lib/db/prisma";

import { ManualCommerceClient } from "./manual-commerce-client";

export type EcommerceSyncRange = {
  since: string;
  until: string;
};

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
    .update([input.workspaceId, input.connectorAccountId, input.provider, input.date].join(":"))
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
    const day = order.placedAt.slice(0, 10);
    const current = byDay.get(day) ?? { revenue: new Decimal(0), orders: 0 };
    current.revenue = current.revenue.plus(order.orderTotal);
    current.orders += 1;
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
    utmSource: input.order.utmSource,
    utmMedium: input.order.utmMedium,
    utmCampaign: input.order.utmCampaign,
    placedAt: new Date(input.order.placedAt),
  };
}

async function persistEcommerceOrders(input: {
  workspaceId: string;
  connectorAccountId: string;
  provider: ConnectorProvider;
  orders: ShopifyOrder[];
}) {
  for (const order of input.orders) {
    const payload = mapEcommerceOrderToRecord({ ...input, order });

    await prisma.ecommerceOrder.upsert({
      where: {
        connectorAccountId_externalOrderId: {
          connectorAccountId: input.connectorAccountId,
          externalOrderId: order.externalOrderId,
        },
      },
      update: payload,
      create: payload,
    });
  }

  const summaries = mapEcommerceOrdersToDailyMetricSummaries(input);
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
  accessToken: string;
  range: EcommerceSyncRange;
}) {
  const connector = await prisma.connectorAccount.findUniqueOrThrow({
    where: { id: input.connectorAccountId },
  });

  if (input.provider === ConnectorProvider.NUVEMSHOP) {
    const metadata =
      connector.metadata && typeof connector.metadata === "object" && !Array.isArray(connector.metadata)
        ? connector.metadata
        : {};
    const client = new NuvemshopClient({
      config: {
        clientId: process.env.NUVEMSHOP_CLIENT_ID ?? "placeholder",
        clientSecret: process.env.NUVEMSHOP_CLIENT_SECRET ?? "placeholder",
        redirectUri: process.env.NUVEMSHOP_REDIRECT_URI ?? "http://localhost:3000/api/connectors/nuvemshop/callback",
        apiBaseUrl: String(metadata.apiBaseUrl ?? process.env.NUVEMSHOP_API_BASE_URL ?? "https://api.tiendanube.com/v1"),
      },
    });

    return client.listOrders({
      storeId: connector.externalAccountId,
      accessToken: input.accessToken,
      since: input.range.since,
      until: input.range.until,
    });
  }

  const credentials = connectorCredentialsFromAccount(connector);
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
}) {
  const syncJob = await prisma.syncJob.create({
    data: {
      connectorAccountId: input.connectorAccountId,
      status: SyncStatus.RUNNING,
      metadata: input.range,
    },
  });

  try {
    const connector = await prisma.connectorAccount.findUniqueOrThrow({
      where: { id: input.connectorAccountId },
    });
    const accessToken = decryptToken({
      ciphertext: connector.accessTokenCiphertext,
      iv: connector.tokenIv,
      authTag: connector.tokenAuthTag,
      keyVersion: connector.tokenKeyVersion,
    });
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
    const message = caught instanceof Error ? caught.message : "Unknown ecommerce sync error";

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
