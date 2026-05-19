import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  normalizeManualCommerceOrder,
  normalizeManualProviderCredentials,
} from "@/lib/connectors/manual-commerce";

describe("manual ecommerce connectors", () => {
  it("normalizes base urls and API credentials for manual providers", () => {
    expect(
      normalizeManualProviderCredentials({
        provider: ConnectorProvider.WBUY,
        storeName: "Loja WBuy",
        baseUrl: "loja.wbuy.com.br/",
        apiKey: "key",
        apiSecret: "secret",
        apiUser: "user",
        apiPassword: "password",
      }),
    ).toEqual({
      provider: ConnectorProvider.WBUY,
      storeName: "Loja WBuy",
      baseUrl: "https://loja.wbuy.com.br",
      apiKey: "key",
      apiSecret: "secret",
      apiUser: "user",
      apiPassword: "password",
    });
  });

  it("maps loose provider order payloads into the common order shape", () => {
    expect(
      normalizeManualCommerceOrder({
        id: 123,
        numero: "1001",
        total: "199.90",
        moeda: "BRL",
        status: "pago",
        email: "cliente@example.com",
        estado: "SC",
        itens: [{ nome: "Produto A", quantidade: 1 }, { name: "Produto B", quantity: 2 }],
        data: "2026-05-18T10:00:00.000Z",
      }),
    ).toEqual({
      externalOrderId: "123",
      orderNumber: "1001",
      orderTotal: "199.90",
      orderCurrency: "BRL",
      customerEmail: "cliente@example.com",
      itemsCount: 3,
      items: [
        {
          productName: "Produto A",
          quantity: 1,
          sku: null,
          total: null,
        },
        {
          productName: "Produto B",
          quantity: 2,
          sku: null,
          total: null,
        },
      ],
      status: "pago",
      shippingState: "SC",
      placedAt: "2026-05-18T10:00:00.000Z",
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
  });

  it("maps WhatsApp Google Sheets rows into approved orders", () => {
    expect(
      normalizeManualCommerceOrder({
        pedido: "WA-42",
        valor: "R$ 1.234,56",
        status: "aprovado",
        estado: "PR",
        origem: "whatsapp",
        data: "2026-05-18T10:00:00.000Z",
      }),
    ).toMatchObject({
      externalOrderId: "WA-42",
      orderNumber: "WA-42",
      orderTotal: "1234.56",
      status: "aprovado",
      shippingState: "PR",
      utmSource: "whatsapp",
    });
  });
});
