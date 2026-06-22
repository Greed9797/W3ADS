import { describe, expect, it, vi } from "vitest";

import { NuvemshopClient } from "@/lib/connectors/nuvemshop/client";
import { ShopifyClient } from "@/lib/connectors/shopify/client";

describe("NuvemshopClient.listProducts", () => {
  it("sums variant stock, picks a SKU and resolves the i18n category", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 42,
            name: { pt: "Vaso Cerâmica" },
            categories: [{ id: 1, name: { pt: "Decoração" } }],
            variants: [
              { sku: "VASO-P", stock: 3 },
              { sku: "VASO-G", stock: 5 },
            ],
          },
        ]),
      )
      .mockResolvedValueOnce(Response.json([]));

    const client = new NuvemshopClient({
      config: {
        clientId: "c",
        clientSecret: "s",
        redirectUri: "https://app/cb",
        apiBaseUrl: "https://api.nuvemshop.com.br/v1",
      },
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const rows = await client.listProducts({
      storeId: "100",
      accessToken: "tok",
    });

    expect(rows).toEqual([
      {
        externalProductId: "42",
        sku: "VASO-P",
        productName: "Vaso Cerâmica",
        categoryName: "Decoração",
        quantity: 8,
      },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toBe("/v1/100/products");
  });
});

describe("ShopifyClient.listProducts", () => {
  const config = {
    apiVersion: "2026-04",
    apiKey: "k",
    apiSecret: "s",
    redirectUri: "https://app/cb",
    scopes: "read_products,read_inventory",
  };

  it("maps productType to category and sums variant inventory", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({
        data: {
          products: {
            edges: [
              {
                cursor: "c1",
                node: {
                  id: "gid://shopify/Product/1",
                  title: "Suculenta",
                  productType: "Plantas",
                  variants: {
                    edges: [
                      { node: { sku: "SUC-1", inventoryQuantity: 10 } },
                      { node: { sku: "SUC-2", inventoryQuantity: 2 } },
                    ],
                  },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    );

    const client = new ShopifyClient({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const rows = await client.listProducts({
      shop: "teststore",
      accessToken: "tok",
    });

    expect(rows).toEqual([
      {
        externalProductId: "gid://shopify/Product/1",
        sku: "SUC-1",
        productName: "Suculenta",
        categoryName: "Plantas",
        quantity: 12,
      },
    ]);
  });

  it("falls back to category-only when the token lacks read_inventory", async () => {
    const fetchMock = vi
      .fn()
      // First call (with inventoryQuantity) is denied for missing scope.
      .mockResolvedValueOnce(
        Response.json({
          errors: [
            {
              message: "Access denied for inventoryQuantity field",
              extensions: { code: "ACCESS_DENIED" },
            },
          ],
        }),
      )
      // Retry without inventoryQuantity succeeds (category-only).
      .mockResolvedValueOnce(
        Response.json({
          data: {
            products: {
              edges: [
                {
                  cursor: "c1",
                  node: {
                    id: "gid://shopify/Product/2",
                    title: "Cacto",
                    productType: "Plantas",
                    variants: { edges: [{ node: { sku: "CAC-1" } }] },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        }),
      );

    const client = new ShopifyClient({
      config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const rows = await client.listProducts({
      shop: "teststore",
      accessToken: "tok",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(rows[0]).toMatchObject({
      productName: "Cacto",
      categoryName: "Plantas",
      quantity: 0, // no inventory scope → stock degrades to 0
    });
  });
});
