import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canOperateWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { GoogleAnalyticsClient } from "@/lib/connectors/google-analytics/client";
import { GOOGLE_ANALYTICS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-analytics/state";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildGoogleAnalyticsConfigFromProviderConfig,
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
  response.cookies.set(GOOGLE_ANALYTICS_OAUTH_STATE_COOKIE, "", {
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
  const storedState = request.cookies.get(GOOGLE_ANALYTICS_OAUTH_STATE_COOKIE)?.value;
  const context = await getCurrentUserContext();

  if (!state || !storedState || state !== storedState) {
    return redirectToConnectors(request, { provider: "google-analytics", error: "invalid-state" });
  }

  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "GA4",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
  });

  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "google-analytics", error: "invalid-state" });
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return redirectToConnectors(request, { provider: "google-analytics", error: "provider-denied" });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToConnectors(request, { provider: "google-analytics", error: "missing-code" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "google-analytics", connected: "demo" });
  }
  if (!canOperateWorkspaceConnectors(context.user, context.currentMembership.role)) {
    return redirectToConnectors(request, { provider: "google-analytics", error: "forbidden" });
  }

  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.GA4,
  });
  if (!providerConfig) {
    return redirectToConnectors(request, {
      provider: "google-analytics",
      error: "missing-provider-config",
    });
  }

  try {
    const client = new GoogleAnalyticsClient({
      config: await buildGoogleAnalyticsConfigFromProviderConfig(providerConfig),
    });
    const token = await client.exchangeCodeForTokens(code);
    const properties = await client.listProperties(token.access_token);
    const expiresAt = tokenExpiresAt(token.expires_in);
    const selection = await createConnectorSelectionSession({
      workspaceId: context.currentWorkspace.id,
      userId: context.user.id,
      provider: ConnectorProvider.GA4,
      accounts: properties.map((property) => ({
        externalAccountId: property.propertyId,
        accountName: `${property.accountName} / ${property.propertyName}`,
        metadata: {
          propertyResourceName: property.propertyResourceName,
          accountResourceName: property.accountResourceName,
        },
      })),
      credentials: {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        tokenExpiresAt: expiresAt?.toISOString(),
      },
    });

    await logAudit({
      action: "connector.google_analytics.selection_created",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_selection_session",
      resourceId: selection.id,
      metadata: {
        provider: "GA4",
        accounts: properties.length,
      },
    });

    const url = new URL("/connectors/select", request.nextUrl.origin);
    url.searchParams.set("session", selection.id);

    return NextResponse.redirect(url);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("Secret not found")
      ? "missing-provider-config"
      : "google-analytics-api";

    return redirectToConnectors(request, { provider: "google-analytics", error: errorCode });
  }
}
