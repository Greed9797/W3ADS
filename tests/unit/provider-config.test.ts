import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  buildGoogleAdsConfigFromProviderConfig,
  buildMetaConfigFromProviderConfig,
  buildShopifyConfigFromProviderConfig,
  publicProviderConfig,
  validateProviderConfigInput,
} from "@/lib/connectors/provider-config";
import { MemorySecretStore } from "@/lib/security/secret-store";

describe("connector provider config", () => {
  it("keeps provider secrets out of public config payloads", async () => {
    const secrets = new MemorySecretStore();
    const appSecretId = await secrets.createSecret({
      name: "meta-secret",
      value: "meta-app-secret",
      description: "Meta app secret",
    });

    const visible = publicProviderConfig({
      id: "cfg_1",
      workspaceId: "workspace_1",
      provider: ConnectorProvider.META_ADS,
      status: "ACTIVE",
      redirectUri: "https://app.w3ads.com.br/api/connectors/meta/callback",
      scopes: "ads_read,read_insights",
      apiVersion: "v25.0",
      baseUrl: null,
      ordersPath: null,
      displayName: "Meta W3",
      secretRefs: { appSecret: appSecretId },
      lastValidatedAt: null,
      lastValidationError: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(JSON.stringify(visible)).not.toContain("meta-app-secret");
    expect(JSON.stringify(visible)).not.toContain(appSecretId);
    expect(visible.configuredSecretKeys).toEqual(["appSecret"]);
  });

  it("builds OAuth provider configs from DB public fields plus vault secrets", async () => {
    const secrets = new MemorySecretStore();
    const metaSecretId = await secrets.createSecret({ name: "meta", value: "meta-secret" });
    const googleClientSecretId = await secrets.createSecret({
      name: "google-client",
      value: "google-client-secret",
    });
    const developerTokenId = await secrets.createSecret({
      name: "google-developer",
      value: "developer-token",
    });
    const shopifySecretId = await secrets.createSecret({
      name: "shopify",
      value: "shopify-secret",
    });

    expect(
      await buildMetaConfigFromProviderConfig(
        {
          provider: ConnectorProvider.META_ADS,
          apiVersion: "v25.0",
          redirectUri: "https://app.w3ads.com.br/api/connectors/meta/callback",
          publicCredentials: { appId: "meta-app-id" },
          secretRefs: { appSecret: metaSecretId },
        },
        secrets,
      ),
    ).toEqual({
      appId: "meta-app-id",
      appSecret: "meta-secret",
      redirectUri: "https://app.w3ads.com.br/api/connectors/meta/callback",
      apiVersion: "v25.0",
    });

    expect(
      await buildGoogleAdsConfigFromProviderConfig(
        {
          provider: ConnectorProvider.GOOGLE_ADS,
          apiVersion: "v24",
          redirectUri: "https://app.w3ads.com.br/api/connectors/google-ads/callback",
          publicCredentials: { clientId: "google-client-id" },
          secretRefs: {
            clientSecret: googleClientSecretId,
            developerToken: developerTokenId,
          },
        },
        secrets,
      ),
    ).toMatchObject({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      developerToken: "developer-token",
    });

    expect(
      await buildShopifyConfigFromProviderConfig(
        {
          provider: ConnectorProvider.SHOPIFY,
          apiVersion: "2026-04",
          redirectUri: "https://app.w3ads.com.br/api/connectors/shopify/callback",
          scopes: "read_orders",
          publicCredentials: { apiKey: "shopify-key" },
          secretRefs: { apiSecret: shopifySecretId },
        },
        secrets,
      ),
    ).toMatchObject({
      apiKey: "shopify-key",
      apiSecret: "shopify-secret",
      scopes: "read_orders",
    });
  });

  it("requires Google Ads developer token before a config can be activated", () => {
    const result = validateProviderConfigInput({
      provider: ConnectorProvider.GOOGLE_ADS,
      status: "ACTIVE",
      redirectUri: "https://app.w3ads.com.br/api/connectors/google-ads/callback",
      apiVersion: "v24",
      publicCredentials: { clientId: "client-id" },
      secrets: { clientSecret: "client-secret" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("developer token");
  });
});
