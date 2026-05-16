import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildShopifyOAuthUrl,
  getShopifyConfigStatus,
  normalizeShopDomain,
  verifyShopifyQueryHmac,
} from "@/lib/connectors/shopify/oauth";

const shopifyEnv = {
  SHOPIFY_API_VERSION: "2026-04",
  SHOPIFY_APP_API_KEY: "shopify-key",
  SHOPIFY_APP_API_SECRET: "shopify-secret",
  SHOPIFY_REDIRECT_URI: "http://localhost:3000/api/connectors/shopify/callback",
  SHOPIFY_SCOPES: "read_orders,read_products",
};

describe("Shopify OAuth helpers", () => {
  it("reports missing env vars without throwing", () => {
    expect(getShopifyConfigStatus({}).missing).toEqual([
      "SHOPIFY_APP_API_KEY",
      "SHOPIFY_APP_API_SECRET",
      "SHOPIFY_REDIRECT_URI",
    ]);
  });

  it("normalizes shop domains", () => {
    expect(normalizeShopDomain("https://Loja-Teste.myshopify.com/admin")).toBe(
      "loja-teste.myshopify.com",
    );
    expect(normalizeShopDomain("loja-teste")).toBe("loja-teste.myshopify.com");
    expect(() => normalizeShopDomain("bad host")).toThrow("Invalid Shopify shop domain");
  });

  it("builds the shop authorization URL", () => {
    const url = buildShopifyOAuthUrl(
      { shop: "loja-teste", state: "csrf-state" },
      shopifyEnv,
    );

    expect(url.origin).toBe("https://loja-teste.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("shopify-key");
    expect(url.searchParams.get("scope")).toBe("read_orders,read_products");
    expect(url.searchParams.get("redirect_uri")).toBe(shopifyEnv.SHOPIFY_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("csrf-state");
  });

  it("verifies Shopify query HMAC", () => {
    const params = new URLSearchParams({
      code: "auth-code",
      shop: "loja-teste.myshopify.com",
      state: "csrf-state",
      timestamp: "1778970000",
    });
    const message = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const hmac = createHmac("sha256", "shopify-secret").update(message).digest("hex");
    params.set("hmac", hmac);

    expect(verifyShopifyQueryHmac(params, "shopify-secret")).toBe(true);
    params.set("hmac", "bad");
    expect(verifyShopifyQueryHmac(params, "shopify-secret")).toBe(false);
  });
});
