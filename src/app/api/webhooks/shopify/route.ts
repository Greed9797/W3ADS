import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { normalizeShopifyWebhookOrder } from "@/lib/connectors/shopify/client";
import {
  getShopifyConfigStatus,
  normalizeShopDomain,
  verifyShopifyWebhookHmac,
} from "@/lib/connectors/shopify/oauth";
import {
  dailyDedupeHash,
  mapShopifyOrderToEcommerceOrder,
} from "@/lib/connectors/shopify/sync";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const orderTopics = new Set(["orders/create", "orders/updated", "orders/paid"]);

function dayBounds(date: Date) {
  const day = date.toISOString().slice(0, 10);

  return {
    day,
    start: new Date(`${day}T00:00:00.000Z`),
    end: new Date(`${day}T23:59:59.999Z`),
  };
}

async function refreshShopifyDailyMetric(input: {
  workspaceId: string;
  connectorAccountId: string;
  placedAt: Date;
}) {
  const bounds = dayBounds(input.placedAt);
  const aggregate = await prisma.ecommerceOrder.aggregate({
    where: {
      connectorAccountId: input.connectorAccountId,
      placedAt: {
        gte: bounds.start,
        lte: bounds.end,
      },
    },
    _sum: { orderTotal: true },
    _count: { _all: true },
  });
  const dedupeHash = dailyDedupeHash({
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    date: bounds.day,
  });

  await prisma.dailyMetric.upsert({
    where: { dedupeHash },
    update: {
      revenue: aggregate._sum.orderTotal?.toString() ?? "0",
      orders: BigInt(aggregate._count._all),
    },
    create: {
      workspaceId: input.workspaceId,
      connectorAccountId: input.connectorAccountId,
      date: bounds.start,
      source: ConnectorProvider.SHOPIFY,
      revenue: aggregate._sum.orderTotal?.toString() ?? "0",
      orders: BigInt(aggregate._count._all),
      dedupeHash,
    },
  });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");
  const topic = request.headers.get("x-shopify-topic");
  const shopHeader = request.headers.get("x-shopify-shop-domain");
  const status = getShopifyConfigStatus();

  if (!status.configured || !process.env.SHOPIFY_APP_API_SECRET) {
    return NextResponse.json({ error: "Shopify webhook secret is not configured" }, { status: 503 });
  }

  if (!verifyShopifyWebhookHmac(rawBody, hmac, process.env.SHOPIFY_APP_API_SECRET)) {
    return NextResponse.json({ error: "Invalid Shopify webhook signature" }, { status: 401 });
  }

  if (topic === "app/uninstalled" && shopHeader) {
    const shop = normalizeShopDomain(shopHeader);

    await prisma.connectorAccount.updateMany({
      where: {
        provider: ConnectorProvider.SHOPIFY,
        externalAccountId: shop,
      },
      data: {
        status: ConnectorStatus.REVOKED,
        lastSyncError: "Shopify app uninstalled",
      },
    });

    await logAudit({
      action: "connector.shopify.uninstall",
      resourceType: "connector_account",
      resourceId: shop,
      metadata: {
        provider: "SHOPIFY",
        topic,
      },
    });
  }

  if (topic && orderTopics.has(topic) && shopHeader) {
    const shop = normalizeShopDomain(shopHeader);
    const order = normalizeShopifyWebhookOrder(
      JSON.parse(rawBody) as Parameters<typeof normalizeShopifyWebhookOrder>[0],
    );
    const connectors = await prisma.connectorAccount.findMany({
      where: {
        provider: ConnectorProvider.SHOPIFY,
        externalAccountId: shop,
        status: ConnectorStatus.ACTIVE,
      },
    });

    for (const connector of connectors) {
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
      await refreshShopifyDailyMetric({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        placedAt: payload.placedAt,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
