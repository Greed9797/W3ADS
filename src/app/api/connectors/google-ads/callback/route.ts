import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import { GoogleAdsClient } from "@/lib/connectors/google-ads/client";
import { getGoogleAdsConfigStatus } from "@/lib/connectors/google-ads/oauth";
import { GOOGLE_ADS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-ads/state";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import { encryptToken, encryptTokenEnvelope } from "@/lib/crypto/token-vault";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/jobs/inngest-client";

export const runtime = "nodejs";

function redirectToConnectors(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connectors", request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_ADS_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

function tokenExpiresAt(expiresInSeconds: number | undefined) {
  return expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(GOOGLE_ADS_OAUTH_STATE_COOKIE)?.value;
  const context = await getCurrentUserContext();

  if (!state || !storedState || state !== storedState) {
    return redirectToConnectors(request, { provider: "google-ads", error: "invalid-state" });
  }

  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "GOOGLE_ADS",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
  });

  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "google-ads", error: "invalid-state" });
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return redirectToConnectors(request, { provider: "google-ads", error: "provider-denied" });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToConnectors(request, { provider: "google-ads", error: "missing-code" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "google-ads", connected: "demo" });
  }

  const status = getGoogleAdsConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, {
      provider: "google-ads",
      error: "missing-google-ads-env",
    });
  }

  try {
    const client = new GoogleAdsClient();
    const token = await client.exchangeCodeForTokens(code);
    const customers = await client.listAccessibleCustomers(token.access_token);
    const expiresAt = tokenExpiresAt(token.expires_in);
    const connectorAccountIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const customer of customers) {
        const encryptedAccessToken = encryptToken(token.access_token);
        const encryptedRefreshToken = token.refresh_token
          ? encryptTokenEnvelope(token.refresh_token)
          : undefined;

        const connectorAccount = await tx.connectorAccount.upsert({
          where: {
            workspaceId_provider_externalAccountId: {
              workspaceId: context.currentWorkspace.id,
              provider: ConnectorProvider.GOOGLE_ADS,
              externalAccountId: customer.customerId,
            },
          },
          update: {
            accountName: customer.displayName,
            status: ConnectorStatus.ACTIVE,
            accessTokenCiphertext: encryptedAccessToken.ciphertext,
            refreshTokenCiphertext: encryptedRefreshToken,
            tokenIv: encryptedAccessToken.iv,
            tokenAuthTag: encryptedAccessToken.authTag,
            tokenKeyVersion: encryptedAccessToken.keyVersion,
            tokenExpiresAt: expiresAt,
            metadata: {
              resourceName: customer.resourceName,
            },
            lastSyncError: null,
          },
          create: {
            workspaceId: context.currentWorkspace.id,
            provider: ConnectorProvider.GOOGLE_ADS,
            externalAccountId: customer.customerId,
            accountName: customer.displayName,
            status: ConnectorStatus.ACTIVE,
            accessTokenCiphertext: encryptedAccessToken.ciphertext,
            refreshTokenCiphertext: encryptedRefreshToken,
            tokenIv: encryptedAccessToken.iv,
            tokenAuthTag: encryptedAccessToken.authTag,
            tokenKeyVersion: encryptedAccessToken.keyVersion,
            tokenExpiresAt: expiresAt,
            metadata: {
              resourceName: customer.resourceName,
            },
          },
        });
        connectorAccountIds.push(connectorAccount.id);
      }
    });

    if (process.env.INNGEST_EVENT_KEY) {
      await Promise.all(
        connectorAccountIds.map((connectorAccountId) =>
          inngest.send(
            buildConnectorBackfillEvent({
              provider: ConnectorProvider.GOOGLE_ADS,
              connectorAccountId,
            }),
          ),
        ),
      );
    }

    await logAudit({
      action: "connector.google_ads.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_account",
      metadata: {
        provider: "GOOGLE_ADS",
        accounts: customers.length,
        backfillQueued: Boolean(process.env.INNGEST_EVENT_KEY),
      },
    });

    return redirectToConnectors(request, { provider: "google-ads", connected: "google-ads" });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("TOKEN_ENCRYPTION_KEY")
      ? "missing-token-key"
      : "google-ads-api";

    return redirectToConnectors(request, { provider: "google-ads", error: errorCode });
  }
}
