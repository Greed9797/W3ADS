import { describe, expect, it } from "vitest";

import {
  GOOGLE_ADS_OAUTH_SCOPE,
  buildGoogleAdsOAuthUrl,
  getGoogleAdsConfigStatus,
} from "@/lib/connectors/google-ads/oauth";

const googleAdsEnv = {
  GOOGLE_ADS_API_VERSION: "v24",
  GOOGLE_ADS_CLIENT_ID: "client-id",
  GOOGLE_ADS_CLIENT_SECRET: "client-secret",
  GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token",
  GOOGLE_ADS_REDIRECT_URI: "http://localhost:3000/api/connectors/google-ads/callback",
};

describe("Google Ads OAuth helpers", () => {
  it("reports missing env vars without throwing", () => {
    expect(getGoogleAdsConfigStatus({}).missing).toEqual([
      "GOOGLE_ADS_CLIENT_ID",
      "GOOGLE_ADS_CLIENT_SECRET",
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_REDIRECT_URI",
    ]);
  });

  it("builds the Google OAuth URL with offline access", () => {
    const url = buildGoogleAdsOAuthUrl({ state: "csrf-state" }, googleAdsEnv);

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(googleAdsEnv.GOOGLE_ADS_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_ADS_OAUTH_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("csrf-state");
  });
});
