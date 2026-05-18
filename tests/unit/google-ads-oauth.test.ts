import { describe, expect, it } from "vitest";

import {
  GOOGLE_ADS_OAUTH_SCOPE,
  buildGoogleAdsOAuthUrl,
} from "@/lib/connectors/google-ads/oauth";
import { GoogleAdsApiError } from "@/lib/connectors/google-ads/client";

const googleAdsConfig = {
  apiVersion: "v24",
  clientId: "client-id",
  clientSecret: "client-secret",
  developerToken: "developer-token",
  redirectUri: "http://localhost:3000/api/connectors/google-ads/callback",
};

describe("Google Ads OAuth helpers", () => {
  it("builds the Google OAuth URL with offline access from workspace provider config", () => {
    const url = buildGoogleAdsOAuthUrl({ state: "csrf-state", config: googleAdsConfig });

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(googleAdsConfig.redirectUri);
    expect(url.searchParams.get("scope")).toBe(GOOGLE_ADS_OAUTH_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("csrf-state");
  });

  it("keeps response headers on API errors so retry can honor Retry-After", () => {
    const headers = new Headers({ "retry-after": "3" });
    const error = new GoogleAdsApiError(429, "quota", headers);

    expect(error.response.status).toBe(429);
    expect(error.response.headers.get("retry-after")).toBe("3");
  });
});
