import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/current";
import { canOperateWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { createConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildNuvemshopOAuthUrl,
  NUVEMSHOP_OAUTH_STATE_COOKIE,
} from "@/lib/connectors/nuvemshop/oauth";
import {
  buildNuvemshopConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();

  if (context.isDemoMode) {
    return NextResponse.redirect(
      new URL("/connectors?provider=nuvemshop&connected=demo", request.nextUrl.origin),
    );
  }
  if (!canOperateWorkspaceConnectors(context.user, context.currentMembership.role)) {
    return NextResponse.redirect(
      new URL("/connectors?provider=nuvemshop&error=forbidden", request.nextUrl.origin),
    );
  }

  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.NUVEMSHOP,
  });
  if (!providerConfig) {
    return NextResponse.redirect(
      new URL("/connectors?provider=nuvemshop&error=missing-provider-config", request.nextUrl.origin),
    );
  }
  const config = await buildNuvemshopConfigFromProviderConfig(providerConfig);

  const state = createConnectorOAuthState({
    provider: ConnectorProvider.NUVEMSHOP,
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
  });
  const response = NextResponse.redirect(buildNuvemshopOAuthUrl({ state, config }));
  response.cookies.set(NUVEMSHOP_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
