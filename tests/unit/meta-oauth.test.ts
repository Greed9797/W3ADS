import { describe, expect, it } from "vitest";

import {
  META_OAUTH_SCOPES,
  buildMetaOAuthUrl,
  getMetaConfigStatus,
} from "@/lib/connectors/meta/oauth";

const metaEnv = {
  META_APP_ID: "123",
  META_APP_SECRET: "secret",
  META_REDIRECT_URI: "http://localhost:3000/api/connectors/meta/callback",
  META_API_VERSION: "v25.0",
};

describe("Meta OAuth helpers", () => {
  it("reports missing env vars without throwing", () => {
    expect(getMetaConfigStatus({}).missing).toEqual([
      "META_APP_ID",
      "META_APP_SECRET",
      "META_REDIRECT_URI",
    ]);
  });

  it("builds the Facebook OAuth URL with scopes and state", () => {
    const url = buildMetaOAuthUrl({ state: "csrf-state" }, metaEnv);

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/v25.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("123");
    expect(url.searchParams.get("redirect_uri")).toBe(metaEnv.META_REDIRECT_URI);
    expect(url.searchParams.get("state")).toBe("csrf-state");
    expect(url.searchParams.get("scope")).toBe(META_OAUTH_SCOPES.join(","));
  });
});
