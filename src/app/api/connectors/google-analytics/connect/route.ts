import { NextResponse, type NextRequest } from "next/server";
import { ConnectorProvider } from "@prisma/client";

import { getCurrentUserContext } from "@/lib/auth/current";
import { canOperateWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { buildGoogleAnalyticsOAuthUrl } from "@/lib/connectors/google-analytics/oauth";
import { GOOGLE_ANALYTICS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-analytics/state";
import { createConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildGoogleAnalyticsConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";

export const runtime = "nodejs";

function redirectToConnectors(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connectors", request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();

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
  const config = await buildGoogleAnalyticsConfigFromProviderConfig(providerConfig);

  const state = createConnectorOAuthState({
    provider: "GA4",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
  });
  const response = NextResponse.redirect(buildGoogleAnalyticsOAuthUrl({ state, config }));

  response.cookies.set(GOOGLE_ANALYTICS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
