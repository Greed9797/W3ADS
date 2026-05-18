import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import { NUVEMSHOP_OAUTH_STATE_COOKIE } from "@/lib/connectors/nuvemshop/oauth";
import { verifyConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildNuvemshopConfigFromProviderConfig,
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
  response.cookies.set(NUVEMSHOP_OAUTH_STATE_COOKIE, "", {
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
  const storedState = request.cookies.get(NUVEMSHOP_OAUTH_STATE_COOKIE)?.value;
  const context = await getCurrentUserContext();

  if (!state || !storedState || state !== storedState) {
    return redirectToConnectors(request, { provider: "nuvemshop", error: "invalid-state" });
  }

  const verifiedState = verifyConnectorOAuthState(state, {
    expectedProvider: "NUVEMSHOP",
    expectedUserId: context.user.id,
    expectedWorkspaceId: context.currentWorkspace.id,
  });
  if (!verifiedState.valid) {
    return redirectToConnectors(request, { provider: "nuvemshop", error: "invalid-state" });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectToConnectors(request, { provider: "nuvemshop", error: "missing-code" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { provider: "nuvemshop", connected: "demo" });
  }

  const providerConfig = await getActiveProviderConfig({
    workspaceId: context.currentWorkspace.id,
    provider: ConnectorProvider.NUVEMSHOP,
  });
  if (!providerConfig) {
    return redirectToConnectors(request, { provider: "nuvemshop", error: "missing-provider-config" });
  }

  try {
    const config = await buildNuvemshopConfigFromProviderConfig(providerConfig);
    const token = await new NuvemshopClient({ config }).exchangeCodeForAccessToken(code);
    const selection = await createConnectorSelectionSession({
      workspaceId: context.currentWorkspace.id,
      userId: context.user.id,
      provider: ConnectorProvider.NUVEMSHOP,
      accounts: [
        {
          externalAccountId: token.storeId,
          accountName: `Nuvemshop ${token.storeId}`,
          metadata: {
            scope: token.scope,
            tokenType: token.tokenType,
            apiBaseUrl: config.apiBaseUrl,
          },
        },
      ],
      credentials: {
        accessToken: token.accessToken,
        storeId: token.storeId,
        apiBaseUrl: config.apiBaseUrl,
      },
    });

    await logAudit({
      action: "connector.nuvemshop.selection_created",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_selection_session",
      resourceId: selection.id,
      metadata: { provider: "NUVEMSHOP", accounts: 1 },
    });

    const url = new URL("/connectors/select", request.nextUrl.origin);
    url.searchParams.set("session", selection.id);

    return NextResponse.redirect(url);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const errorCode = message.includes("Secret not found")
      ? "missing-provider-config"
      : "nuvemshop-api";

    return redirectToConnectors(request, { provider: "nuvemshop", error: errorCode });
  }
}
