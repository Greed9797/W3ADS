import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { normalizeLojaIntegradaInventory } from "@/lib/connectors/inventory";
import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";
import { buildDashboardSnapshot } from "@/lib/metrics/aggregator";
import { getDashboardPeriod } from "@/lib/metrics/period";

describe("normalizeLojaIntegradaInventory", () => {
  it("reads a flat stock quantity", () => {
    expect(
      normalizeLojaIntegradaInventory({
        id: 10,
        nome: "Perfume X",
        sku: "PX-100",
        quantidade: "7",
      }),
    ).toEqual({
      externalProductId: "10",
      sku: "PX-100",
      productName: "Perfume X",
      quantity: 7,
    });
  });

  it("reads a nested estoque.quantidade", () => {
    const row = normalizeLojaIntegradaInventory({
      id: 11,
      nome: "Perfume Y",
      estoque: { quantidade: 3 },
    });
    expect(row?.quantity).toBe(3);
  });

  it("defaults quantity to 0 when stock is absent", () => {
    const row = normalizeLojaIntegradaInventory({ id: 12, nome: "Perfume Z" });
    expect(row?.quantity).toBe(0);
  });

  it("returns null without an id or name", () => {
    expect(normalizeLojaIntegradaInventory({ quantidade: 5 })).toBeNull();
  });
});

describe("ManualCommerceClient.listInventory (Loja Integrada)", () => {
  it("paginates /produto/search/ and maps stock rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          meta: { next: "/api/v1/produto/search/?offset=100" },
          objects: Array.from({ length: 100 }, (_, idx) => ({
            id: idx + 1,
            nome: `Produto ${idx + 1}`,
            quantidade: 2,
          })),
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          meta: { next: null },
          objects: [{ id: 101, nome: "Produto 101", quantidade: 9 }],
        }),
      );

    const client = new ManualCommerceClient({
      provider: ConnectorProvider.LOJA_INTEGRADA,
      credentials: { apiKey: "k", apiSecret: "s" },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const rows = await client.listInventory();
    expect(rows).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const url1 = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url1.pathname).toBe("/v1/produto/search/");
    expect(url1.searchParams.get("limit")).toBe("100");
    expect(rows[100]).toMatchObject({
      productName: "Produto 101",
      quantity: 9,
    });
  });

  it("returns [] for providers without an inventory source", async () => {
    const client = new ManualCommerceClient({
      provider: ConnectorProvider.WBUY,
      credentials: { apiKey: "Bearer t" },
      fetchImpl: vi.fn() as unknown as typeof fetch,
    });
    expect(await client.listInventory()).toEqual([]);
  });
});

describe("dashboard products join inventory", () => {
  it("fills stockQuantity from inventory by product name", () => {
    const period = getDashboardPeriod(
      { period: "week" },
      new Date("2026-05-16T12:00:00.000Z"),
    );
    const snapshot = buildDashboardSnapshot({
      period,
      orders: [],
      metrics: [],
      orderItems: [
        {
          productName: "Perfume X",
          categoryName: "Perfumes",
          quantity: 4,
          total: "400.00",
          status: "pago",
          placedAt: new Date("2026-05-10T12:00:00.000Z"),
        },
      ],
      inventory: [
        { productName: "perfume x", quantity: 5 },
        { productName: "Perfume X", quantity: 2 },
      ],
    });

    const product = snapshot.products.find(
      (p) => p.productName === "Perfume X",
    );
    // Case-insensitive match, summed across connectors (5 + 2).
    expect(product?.stockQuantity).toBe(7);
  });

  it("leaves stockQuantity null when no inventory matches", () => {
    const period = getDashboardPeriod(
      { period: "week" },
      new Date("2026-05-16T12:00:00.000Z"),
    );
    const snapshot = buildDashboardSnapshot({
      period,
      orders: [],
      metrics: [],
      orderItems: [
        {
          productName: "Sem Estoque",
          categoryName: null,
          quantity: 1,
          total: "10.00",
          status: "pago",
          placedAt: new Date("2026-05-10T12:00:00.000Z"),
        },
      ],
      inventory: [],
    });
    expect(snapshot.products[0]?.stockQuantity).toBeNull();
  });
});
