import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizeShopifyOrder } from "@/lib/connectors/shopify/client";
import { mapShopifyOrderToEcommerceOrder } from "@/lib/connectors/shopify/sync";

describe("Shopify orders normalization", () => {
  it("normalizes GraphQL order nodes", () => {
    const order = normalizeShopifyOrder({
      id: "gid://shopify/Order/123",
      name: "#1001",
      createdAt: "2026-05-01T10:00:00Z",
      displayFinancialStatus: "PAID",
      totalPriceSet: { shopMoney: { amount: "199.90", currencyCode: "BRL" } },
      customer: { email: "cliente@example.com" },
      lineItems: {
        edges: [
          { node: { quantity: 2 } },
          { node: { quantity: 1 } },
        ],
      },
    });

    expect(order).toMatchObject({
      externalOrderId: "gid://shopify/Order/123",
      orderNumber: "#1001",
      orderTotal: "199.90",
      orderCurrency: "BRL",
      customerEmail: "cliente@example.com",
      itemsCount: 3,
      status: "PAID",
    });
  });

  it("maps Shopify orders to EcommerceOrder payloads", () => {
    const payload = mapShopifyOrderToEcommerceOrder({
      workspaceId: "workspace-1",
      connectorAccountId: "connector-1",
      order: {
        externalOrderId: "gid://shopify/Order/123",
        orderNumber: "#1001",
        orderTotal: "199.90",
        orderCurrency: "BRL",
        customerEmail: "cliente@example.com",
        itemsCount: 3,
        status: "PAID",
        placedAt: "2026-05-01T10:00:00Z",
      },
    });

    expect(payload.platform).toBe(ConnectorProvider.SHOPIFY);
    expect(payload.externalOrderId).toBe("gid://shopify/Order/123");
    expect(payload.itemsCount).toBe(3);
  });
});
