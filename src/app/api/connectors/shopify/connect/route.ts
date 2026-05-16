import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUserContext } from "@/lib/auth/current";
import {
  buildShopifyOAuthUrl,
  getShopifyConfigStatus,
  normalizeShopDomain,
} from "@/lib/connectors/shopify/oauth";
import { SHOPIFY_OAUTH_STATE_COOKIE } from "@/lib/connectors/shopify/state";
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

  const status = getShopifyConfigStatus();
  if (!status.configured) {
    return redirectToConnectors(request, { provider: "shopify", error: "missing-shopify-env" });
  }

  const shopParam = request.nextUrl.searchParams.get("shop");
  if (!shopParam) {
    return redirectToConnectors(request, { provider: "shopify", error: "missing-shop" });
  }

  let shop: string;
  try {
    shop = normalizeShopDomain(shopParam);
  } catch {
    return redirectToConnectors(request, { provider: "shopify", error: "invalid-shop" });
  }

  const state = createSecureToken(16);
  const response = NextResponse.redirect(buildShopifyOAuthUrl({ shop, state }));

  response.cookies.set(SHOPIFY_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
