import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canManageConnectors } from "@/lib/auth/permissions";
import { GoogleAdsClient } from "@/lib/connectors/google-ads/client";
import { GOOGLE_ADS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-ads/state";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildGoogleAdsConfigFromProviderConfig,
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
  if (!canManageConnectors(context.currentMembership.role)) {
    return redirectToConnectors(request, { provider: "google-ads", error: "forbidden" });
  }

  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.GOOGLE_ADS,
  });
  if (!providerConfig) {
    return redirectToConnectors(request, {
      provider: "google-ads",
      error: "missing-provider-config",
    });
  }

  try {
    const client = new GoogleAdsClient({
      config: await buildGoogleAdsConfigFromProviderConfig(providerConfig),
    });
    const token = await client.exchangeCodeForTokens(code);
    const customers = await client.listSelectableCustomers(token.access_token);
    const expiresAt = tokenExpiresAt(token.expires_in);
    const selection = await createConnectorSelectionSession({
      workspaceId: context.currentWorkspace.id,
      userId: context.user.id,
      provider: ConnectorProvider.GOOGLE_ADS,
      accounts: customers.map((customer) => ({
        externalAccountId: customer.id,
        accountName: customer.name,
        metadata: {
          resourceName: customer.resourceName,
          currencyCode: customer.currencyCode,
          timeZone: customer.timeZone,
          loginCustomerId: customer.loginCustomerId,
          rootCustomerId: customer.rootCustomerId,
        },
      })),
      credentials: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt: expiresAt?.toISOString(),
      },
    });

    await logAudit({
      action: "connector.google_ads.selection_created",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_selection_session",
      resourceId: selection.id,
      metadata: {
        provider: "GOOGLE_ADS",
        accounts: customers.length,
      },
    });

    const url = new URL("/connectors/select", request.nextUrl.origin);
    url.searchParams.set("session", selection.id);

    return NextResponse.redirect(url);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("Secret not found")
      ? "missing-provider-config"
      : "google-ads-api";

    return redirectToConnectors(request, { provider: "google-ads", error: errorCode });
  }
}
