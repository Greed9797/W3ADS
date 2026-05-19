import { NextResponse, type NextRequest } from "next/server";
import { ConnectorProvider } from "@prisma/client";

import { getCurrentUserContext } from "@/lib/auth/current";
import { canOperateWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { buildGoogleAdsOAuthUrl } from "@/lib/connectors/google-ads/oauth";
import { GOOGLE_ADS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-ads/state";
import { createConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildGoogleAdsConfigFromProviderConfig,
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
    return redirectToConnectors(request, { provider: "google-ads", connected: "demo" });
  }
  if (!canOperateWorkspaceConnectors(context.user, context.currentMembership.role)) {
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
  const config = await buildGoogleAdsConfigFromProviderConfig(providerConfig);

  const state = createConnectorOAuthState({
    provider: "GOOGLE_ADS",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
  });
  const response = NextResponse.redirect(buildGoogleAdsOAuthUrl({ state, config }));

  response.cookies.set(GOOGLE_ADS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
