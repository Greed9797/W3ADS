import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canManageConnectors } from "@/lib/auth/permissions";
import { MetaMarketingClient, tokenExpiresAt } from "@/lib/connectors/meta/client";
import { META_OAUTH_STATE_COOKIE } from "@/lib/connectors/meta/state";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildMetaConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";
import { createConnectorSelectionSession } from "@/lib/connectors/selection";

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
  if (!canManageConnectors(context.currentMembership.role)) {
    return redirectToConnectors(request, { provider: "meta", error: "forbidden" });
  }

  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.META_ADS,
  });
  if (!providerConfig) {
    return redirectToConnectors(request, { provider: "meta", error: "missing-provider-config" });
  }

  try {
    const client = new MetaMarketingClient({
      config: await buildMetaConfigFromProviderConfig(providerConfig),
    });
    const shortLivedToken = await client.exchangeCodeForShortLivedToken(code);
    const longLivedToken = await client.exchangeForLongLivedToken(shortLivedToken.access_token);
    const accounts = await client.listAdAccounts(longLivedToken.access_token);
    const expiresAt = tokenExpiresAt(longLivedToken.expires_in);
    const selection = await createConnectorSelectionSession({
      workspaceId: context.currentWorkspace.id,
      userId: context.user.id,
      provider: ConnectorProvider.META_ADS,
      accounts: accounts.map((account) => ({
        externalAccountId: account.id,
        accountName: account.name,
        metadata: {
          accountId: account.accountId,
          currency: account.currency,
          timezone: account.timezoneName,
        },
      })),
      credentials: {
        accessToken: longLivedToken.access_token,
        tokenExpiresAt: expiresAt?.toISOString(),
      },
    });

    await logAudit({
      action: "connector.meta.selection_created",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_selection_session",
      resourceId: selection.id,
      metadata: {
        provider: "META_ADS",
        accounts: accounts.length,
      },
    });

    const url = new URL("/connectors/select", request.nextUrl.origin);
    url.searchParams.set("session", selection.id);

    return NextResponse.redirect(url);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("Secret not found") ? "missing-provider-config" : "meta-api";

    return redirectToConnectors(request, { provider: "meta", error: errorCode });
  }
}
