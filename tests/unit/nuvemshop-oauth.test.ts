import { describe, expect, it, vi } from "vitest";

import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import { buildNuvemshopOAuthUrl } from "@/lib/connectors/nuvemshop/oauth";

const config = {
  clientId: "app-id",
  clientSecret: "app-secret",
  redirectUri: "http://localhost:3000/api/connectors/nuvemshop/callback",
  apiBaseUrl: "https://api.tiendanube.com/v1",
};

describe("Nuvemshop OAuth", () => {
  it("builds the install URL with state from workspace provider config", () => {
    const url = buildNuvemshopOAuthUrl({ state: "csrf-state", config });

    expect(url.toString()).toBe(
      "https://www.tiendanube.com/apps/app-id/authorize?state=csrf-state",
    );
  });

  it("exchanges the code for a non-expiring store token", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        access_token: "store-token",
        token_type: "bearer",
        scope: "read_orders",
        user_id: 2093261,
      }),
    );
    const client = new NuvemshopClient({
      config: {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        redirectUri: config.redirectUri,
        apiBaseUrl: config.apiBaseUrl,
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.exchangeCodeForAccessToken("code")).resolves.toEqual({
      accessToken: "store-token",
      tokenType: "bearer",
      scope: "read_orders",
      storeId: "2093261",
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.tiendanube.com/apps/authorize/token");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain("client_secret=app-secret");
  });
});
