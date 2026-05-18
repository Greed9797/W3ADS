import { describe, expect, it, vi } from "vitest";

import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import {
  buildNuvemshopOAuthUrl,
  getNuvemshopConfigStatus,
} from "@/lib/connectors/nuvemshop/oauth";

const env = {
  NUVEMSHOP_CLIENT_ID: "app-id",
  NUVEMSHOP_CLIENT_SECRET: "app-secret",
  NUVEMSHOP_REDIRECT_URI: "http://localhost:3000/api/connectors/nuvemshop/callback",
};

describe("Nuvemshop OAuth", () => {
  it("reports required env vars", () => {
    expect(getNuvemshopConfigStatus({}).missing).toEqual([
      "NUVEMSHOP_CLIENT_ID",
      "NUVEMSHOP_CLIENT_SECRET",
      "NUVEMSHOP_REDIRECT_URI",
    ]);
  });

  it("builds the install URL with state", () => {
    const url = buildNuvemshopOAuthUrl({ state: "csrf-state" }, env);

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
        clientId: env.NUVEMSHOP_CLIENT_ID,
        clientSecret: env.NUVEMSHOP_CLIENT_SECRET,
        redirectUri: env.NUVEMSHOP_REDIRECT_URI,
        apiBaseUrl: "https://api.tiendanube.com/v1",
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
