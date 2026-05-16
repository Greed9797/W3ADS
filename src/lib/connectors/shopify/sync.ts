import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";
import Decimal from "decimal.js";

import { decryptToken } from "@/lib/crypto/token-vault";
import { prisma } from "@/lib/db/prisma";

import { ShopifyClient, type ShopifyOrder } from "./client";

export type ShopifySyncRange = {
  since: string;
  until: string;
};

function asDateOnly(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function dailyDedupeHash(input: {
  workspaceId: string;
  connectorAccountId: string;
  date: string;
}) {
  return createHash("sha256")
    .update([input.workspaceId, input.connectorAccountId, input.date, ConnectorProvider.SHOPIFY].join(":"))
    .digest("hex");
}

export function mapShopifyOrderToEcommerceOrder(input: {
  workspaceId: string;
  connectorAccountId: string;
  order: ShopifyOrder;
}) {
  return {
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    externalOrderId: input.order.externalOrderId,
    platform: ConnectorProvider.SHOPIFY,
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

export async function syncShopifyOrders(input: {
  connectorAccountId: string;
  range: ShopifySyncRange;
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
    const client = new ShopifyClient();
    const orders = await client.listOrders({
      shop: connector.externalAccountId,
      accessToken,
      since: input.range.since,
      until: input.range.until,
    });

    for (const order of orders) {
      const payload = mapShopifyOrderToEcommerceOrder({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        order,
      });

      await prisma.ecommerceOrder.upsert({
        where: {
          connectorAccountId_externalOrderId: {
            connectorAccountId: connector.id,
            externalOrderId: order.externalOrderId,
          },
        },
        update: payload,
        create: payload,
      });
    }

    const byDay = new Map<string, { revenue: Decimal; orders: number }>();
    for (const order of orders) {
      const day = order.placedAt.slice(0, 10);
      const current = byDay.get(day) ?? { revenue: new Decimal(0), orders: 0 };
      current.revenue = current.revenue.plus(order.orderTotal);
      current.orders += 1;
      byDay.set(day, current);
    }

    for (const [day, summary] of byDay) {
      const dedupeHash = dailyDedupeHash({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        date: day,
      });

      await prisma.dailyMetric.upsert({
        where: { dedupeHash },
        update: {
          revenue: summary.revenue.toFixed(2),
          orders: BigInt(summary.orders),
        },
        create: {
          workspaceId: connector.workspaceId,
          connectorAccountId: connector.id,
          date: asDateOnly(day),
          source: ConnectorProvider.SHOPIFY,
          revenue: summary.revenue.toFixed(2),
          orders: BigInt(summary.orders),
          dedupeHash,
        },
      });
    }

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
    const message = caught instanceof Error ? caught.message : "Unknown Shopify sync error";

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
