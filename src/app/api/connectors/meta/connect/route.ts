import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/current";
import { buildMetaOAuthUrl, getMetaConfigStatus } from "@/lib/connectors/meta/oauth";
import { META_OAUTH_STATE_COOKIE } from "@/lib/connectors/meta/state";
import { createSecureToken } from "@/lib/utils/tokens";

export const runtime = "nodejs";

function redirectToConnectors(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connectors", request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  await getCurrentUserContext();

  const status = getMetaConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, { provider: "meta", error: "missing-env" });
  }

  const state = createSecureToken(16);
  const response = NextResponse.redirect(buildMetaOAuthUrl({ state }));

  response.cookies.set(META_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
