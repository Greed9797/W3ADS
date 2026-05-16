import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/current";
import {
  buildGoogleAdsOAuthUrl,
  getGoogleAdsConfigStatus,
} from "@/lib/connectors/google-ads/oauth";
import { GOOGLE_ADS_OAUTH_STATE_COOKIE } from "@/lib/connectors/google-ads/state";
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

  const status = getGoogleAdsConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, {
      provider: "google-ads",
      error: "missing-google-ads-env",
    });
  }

  const state = createSecureToken(16);
  const response = NextResponse.redirect(buildGoogleAdsOAuthUrl({ state }));

  response.cookies.set(GOOGLE_ADS_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
