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

  it("reads Google Sheets as real-time CSV orders", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          "pedido,valor,status,estado,data\nWA-1,\"R$ 1.234,56\",pago,SC,2026-05-18T10:00:00.000Z\n",
        ),
    );
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.GOOGLE_SHEETS,
      credentials: {
        baseUrl:
          "https://docs.google.com/spreadsheets/d/14h4veQ1W9Qfv5mHGyFqcwdBDLwIDUKlV/edit?gid=1004138552#gid=1004138552",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const orders = await client.listOrders({ since: "2026-05-01", until: "2026-05-18" });

    const [url] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://docs.google.com/spreadsheets/d/14h4veQ1W9Qfv5mHGyFqcwdBDLwIDUKlV/export?format=csv&gid=1004138552",
    );
    expect(orders).toEqual([
      {
        pedido: "WA-1",
        valor: "R$ 1.234,56",
        status: "pago",
        estado: "SC",
        data: "2026-05-18T10:00:00.000Z",
      },
    ]);
  });
});
