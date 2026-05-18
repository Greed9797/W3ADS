import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import { MetaMarketingClient, tokenExpiresAt } from "@/lib/connectors/meta/client";
import { getMetaConfigStatus } from "@/lib/connectors/meta/oauth";
import { META_OAUTH_STATE_COOKIE } from "@/lib/connectors/meta/state";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
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
  response.cookies.set(META_OAUTH_STATE_COOKIE, "", {
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
  const storedState = request.cookies.get(META_OAUTH_STATE_COOKIE)?.value;
  const context = await getCurrentUserContext();

  if (!state || !storedState || state !== storedState) {
    return redirectToConnectors(request, { provider: "meta", error: "invalid-state" });
  }

  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "META_ADS",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
  });

  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "meta", error: "invalid-state" });
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return redirectToConnectors(request, { provider: "meta", error: "provider-denied" });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToConnectors(request, { provider: "meta", error: "missing-code" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "meta", connected: "demo" });
  }

  const status = getMetaConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, { provider: "meta", error: "missing-env" });
  }

  try {
    const client = new MetaMarketingClient();
    const shortLivedToken = await client.exchangeCodeForShortLivedToken(code);
    const longLivedToken = await client.exchangeForLongLivedToken(shortLivedToken.access_token);
    const accounts = await client.listAdAccounts(longLivedToken.access_token);
    const expiresAt = tokenExpiresAt(longLivedToken.expires_in);
    const connectorAccountIds: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (const account of accounts) {
        const encryptedToken = encryptToken(longLivedToken.access_token);

        const connectorAccount = await tx.connectorAccount.upsert({
          where: {
            workspaceId_provider_externalAccountId: {
              workspaceId: context.currentWorkspace.id,
              provider: ConnectorProvider.META_ADS,
              externalAccountId: account.id,
            },
          },
          update: {
            accountName: account.name,
            status: ConnectorStatus.ACTIVE,
            accessTokenCiphertext: encryptedToken.ciphertext,
            refreshTokenCiphertext: null,
            tokenIv: encryptedToken.iv,
            tokenAuthTag: encryptedToken.authTag,
            tokenKeyVersion: encryptedToken.keyVersion,
            tokenExpiresAt: expiresAt,
            metadata: {
              accountId: account.accountId,
              currency: account.currency,
              timezone: account.timezoneName,
            },
            lastSyncError: null,
          },
          create: {
            workspaceId: context.currentWorkspace.id,
            provider: ConnectorProvider.META_ADS,
            externalAccountId: account.id,
            accountName: account.name,
            status: ConnectorStatus.ACTIVE,
            accessTokenCiphertext: encryptedToken.ciphertext,
            refreshTokenCiphertext: null,
            tokenIv: encryptedToken.iv,
            tokenAuthTag: encryptedToken.authTag,
            tokenKeyVersion: encryptedToken.keyVersion,
            tokenExpiresAt: expiresAt,
            metadata: {
              accountId: account.accountId,
              currency: account.currency,
              timezone: account.timezoneName,
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
              provider: ConnectorProvider.META_ADS,
              connectorAccountId,
            }),
          ),
        ),
      );
    }

    await logAudit({
      action: "connector.meta.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_account",
      metadata: {
        provider: "META_ADS",
        accounts: accounts.length,
        backfillQueued: Boolean(process.env.INNGEST_EVENT_KEY),
      },
    });

    return redirectToConnectors(request, { provider: "meta", connected: "meta" });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("TOKEN_ENCRYPTION_KEY") ? "missing-token-key" : "meta-api";

    return redirectToConnectors(request, { provider: "meta", error: errorCode });
  }
}
