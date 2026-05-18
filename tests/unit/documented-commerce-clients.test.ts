import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";

describe("documented ecommerce API clients", () => {
  it("uses WBuy base URL, order resource, Base64 bearer auth and required user agent", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.WBUY,
      credentials: {
        apiUser: "usuario",
        apiPassword: "senha",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.listOrders({ since: "2026-05-01", until: "2026-05-18" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toContain("https://sistema.sistemawbuy.com.br/api/v1/order");
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${Buffer.from("usuario:senha").toString("base64")}`,
      "User-Agent": "W3ADS (integracoes@w3educacao.com.br)",
    });
  });

  it("sends Tray access_token as query parameter instead of generic auth headers", async () => {
    const fetchMock = vi.fn(async () => Response.json({ pedidos: [] }));
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.TRAY,
      credentials: {
        baseUrl: "https://api.tray.com.br",
        apiKey: "tray-token",
        ordersPath: "/orders",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.healthCheck();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get("access_token")).toBe("tray-token");
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(init.headers).not.toHaveProperty("X-Api-Key");
  });

  it("uses iSet store ws/v1 base and integration key headers", async () => {
    const fetchMock = vi.fn(async () => Response.json({ pedidos: [] }));
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.ISET,
      credentials: {
        baseUrl: "https://loja.example.com",
        apiKey: "iset-key",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.healthCheck();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toContain("https://loja.example.com/ws/v1/pedidos");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer iset-key",
      "X-Integration-Key": "iset-key",
    });
  });

  it("uses Magazord specific pedidos path and credential headers, not generic /orders", async () => {
    const fetchMock = vi.fn(async () => Response.json({ data: [] }));
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.MAGAZORD,
      credentials: {
        baseUrl: "https://api.magazord.com.br",
        apiUser: "usuario",
        apiPassword: "senha",
        apiKey: "token",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await client.healthCheck();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.pathname).toContain("/pedidos");
    expect(url.pathname).not.toContain("/orders");
    expect(init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("usuario:senha").toString("base64")}`,
      "X-Api-Token": "token",
    });
  });
});
