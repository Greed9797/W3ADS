import { ConnectorProvider } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/current";
import { createConnectorOAuthState } from "@/lib/connectors/oauth-state";
import {
  buildNuvemshopOAuthUrl,
  getNuvemshopConfigStatus,
  NUVEMSHOP_OAUTH_STATE_COOKIE,
} from "@/lib/connectors/nuvemshop/oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const context = await getCurrentUserContext();
  const status = getNuvemshopConfigStatus();

  if (!status.configured) {
    return NextResponse.redirect(
      new URL("/connectors?provider=nuvemshop&error=missing-nuvemshop-env", request.nextUrl.origin),
    );
  }

  const state = createConnectorOAuthState({
    provider: ConnectorProvider.NUVEMSHOP,
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
  });
  const response = NextResponse.redirect(buildNuvemshopOAuthUrl({ state }));
  response.cookies.set(NUVEMSHOP_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return response;
}
