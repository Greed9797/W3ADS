import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import { ShopifyClient } from "@/lib/connectors/shopify/client";
import {
  getShopifyConfig,
  getShopifyConfigStatus,
  normalizeShopDomain,
  verifyShopifyQueryHmac,
} from "@/lib/connectors/shopify/oauth";
import { SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/connectors/shopify/state";
import { encryptToken } from "@/lib/crypto/token-vault";
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
  const status = getShopifyConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, { provider: "shopify", error: "missing-shopify-env" });
  }

  const config = getShopifyConfig();
  if (!verifyShopifyQueryHmac(request.nextUrl.searchParams, config.apiSecret)) {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-hmac" });
  }

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
  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "SHOPIFY",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
    expectedShop: shop,
  });

  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-state" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "shopify", connected: "demo" });
  }

  try {
    const client = new ShopifyClient();
    const token = await client.exchangeCodeForAccessToken({ shop, code });
    const encryptedToken = encryptToken(token.access_token);

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
        accessTokenCiphertext: encryptedToken.ciphertext,
        refreshTokenCiphertext: null,
        tokenIv: encryptedToken.iv,
        tokenAuthTag: encryptedToken.authTag,
        tokenKeyVersion: encryptedToken.keyVersion,
        tokenExpiresAt: null,
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
        accessTokenCiphertext: encryptedToken.ciphertext,
        refreshTokenCiphertext: null,
        tokenIv: encryptedToken.iv,
        tokenAuthTag: encryptedToken.authTag,
        tokenKeyVersion: encryptedToken.keyVersion,
        tokenExpiresAt: null,
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
    const errorCode = message.includes("TOKEN_ENCRYPTION_KEY")
      ? "missing-token-key"
      : "shopify-api";

    return redirectToConnectors(request, { provider: "shopify", error: errorCode });
  }
}
