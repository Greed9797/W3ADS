import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canManageConnectors } from "@/lib/auth/permissions";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import { vaultCredentialFields } from "@/lib/connectors/credentials";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildShopifyConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";
import { ShopifyClient } from "@/lib/connectors/shopify/client";
import {
  normalizeShopDomain,
  verifyShopifyQueryHmac,
} from "@/lib/connectors/shopify/oauth";
import { SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/connectors/shopify/state";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/jobs/inngest-client";

export const runtime = "nodejs";

function redirectToConnectors(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connectors", request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(SHOPIFY_OAUTH_STATE_COOKIE)?.value;

  if (!state || !storedState || state !== storedState) {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-state" });
  }

  const code = request.nextUrl.searchParams.get("code");
  const shopParam = request.nextUrl.searchParams.get("shop");

  if (!code || !shopParam) {
    return redirectToConnectors(request, { provider: "shopify", error: "missing-code" });
  }

  const shop = normalizeShopDomain(shopParam);
  const context = await getCurrentUserContext();
  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "shopify", connected: "demo" });
  }
  if (!canManageConnectors(context.currentMembership.role)) {
    return redirectToConnectors(request, { provider: "shopify", error: "forbidden" });
  }
  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.SHOPIFY,
  });
  if (!providerConfig) {
    return redirectToConnectors(request, { provider: "shopify", error: "missing-provider-config" });
  }

  const config = await buildShopifyConfigFromProviderConfig(providerConfig);
  if (!verifyShopifyQueryHmac(request.nextUrl.searchParams, config.apiSecret)) {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-hmac" });
  }

  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "SHOPIFY",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
    expectedShop: shop,
  });

  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-state" });
  }

  try {
    const client = new ShopifyClient({ config });
    const token = await client.exchangeCodeForAccessToken({ shop, code });
    const credentialFields = await vaultCredentialFields({
      workspaceId: context.currentWorkspace.id,
      provider: ConnectorProvider.SHOPIFY,
      externalAccountId: shop,
      credentials: { accessToken: token.access_token },
    });

    const connectorAccount = await prisma.connectorAccount.upsert({
      where: {
        workspaceId_provider_externalAccountId: {
          workspaceId: context.currentWorkspace.id,
          provider: ConnectorProvider.SHOPIFY,
          externalAccountId: shop,
        },
      },
      update: {
        accountName: shop,
        status: ConnectorStatus.ACTIVE,
        ...credentialFields,
        metadata: {
          scope: token.scope,
          apiVersion: config.apiVersion,
        },
        lastSyncError: null,
      },
      create: {
        workspaceId: context.currentWorkspace.id,
        provider: ConnectorProvider.SHOPIFY,
        externalAccountId: shop,
        accountName: shop,
        status: ConnectorStatus.ACTIVE,
        ...credentialFields,
        metadata: {
          scope: token.scope,
          apiVersion: config.apiVersion,
        },
      },
    });

    await client.ensureWebhookSubscriptions({
      shop,
      accessToken: token.access_token,
    });

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send(
        buildConnectorBackfillEvent({
          provider: ConnectorProvider.SHOPIFY,
          connectorAccountId: connectorAccount.id,
          scopes: token.scope ?? config.scopes,
        }),
      );
    }

    await logAudit({
      action: "connector.shopify.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_account",
      resourceId: shop,
      metadata: {
        provider: "SHOPIFY",
        backfillQueued: Boolean(process.env.INNGEST_EVENT_KEY),
      },
    });

    return redirectToConnectors(request, { provider: "shopify", connected: "shopify" });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("Secret not found")
      ? "missing-provider-config"
      : "shopify-api";

    return redirectToConnectors(request, { provider: "shopify", error: errorCode });
  }
}
