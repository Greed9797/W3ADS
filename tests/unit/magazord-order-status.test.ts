import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizeManualCommerceOrder } from "@/lib/connectors/manual-commerce";
import { isApprovedOrderStatus } from "@/lib/metrics/order-status";

function magazordOrder(status: string, total = "100.00") {
  return normalizeManualCommerceOrder({
    id: `pedido-${status}`,
    codigo: `PED-${status}`,
    dataHora: "2026-07-14 10:42:16-03",
    valorTotal: total,
    pedidoSituacaoDescricao: status,
    pedidoSituacaoTipo: status === "Cancelado" ? 3 : 1,
  });
}

describe("Magazord order status → approved revenue", () => {
  it.each([
    ["Cancelado", false],
    ["Aguardando Pagamento", false],
    ["Crédito e Cadastro Aprovados", true],
    ["Transporte", true],
  ])("preserves and classifies %s", (status, expectedApproved) => {
    const order = magazordOrder(status);

    expect(order.status).toBe(status);
    expect(
      isApprovedOrderStatus(order.status, ConnectorProvider.MAGAZORD),
    ).toBe(expectedApproved);
  });

  it("excludes cancelled and awaiting-payment amounts from the Magazord total", () => {
    const orders = [
      magazordOrder("Cancelado", "700.00"),
      magazordOrder("Aguardando Pagamento", "300.00"),
      magazordOrder("Crédito e Cadastro Aprovados", "1250.50"),
      magazordOrder("Transporte", "849.50"),
    ];

    const approved = orders.filter((order) =>
      isApprovedOrderStatus(order.status, ConnectorProvider.MAGAZORD),
    );
    const revenue = approved.reduce(
      (sum, order) => sum + Number(order.orderTotal),
      0,
    );

    expect(approved).toHaveLength(2);
    expect(revenue).toBe(2100);
  });

  it("does not treat Transporte as paid outside Magazord", () => {
    expect(
      isApprovedOrderStatus("Transporte", ConnectorProvider.SHOPIFY),
    ).toBe(false);
  });
});
