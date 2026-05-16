import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import {
  getShopifyConfigStatus,
  normalizeShopDomain,
  verifyShopifyWebhookHmac,
} from "@/lib/connectors/shopify/oauth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

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

  return NextResponse.json({ ok: true });
}
