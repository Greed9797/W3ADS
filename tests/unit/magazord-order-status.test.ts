import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizeManualCommerceOrder } from "@/lib/connectors/manual-commerce";
import { isApprovedOrderStatus } from "@/lib/metrics/order-status";

function magazordOrder(
  code: number | undefined,
  description: string,
  total = "100.00",
) {
  return normalizeManualCommerceOrder(
    {
      id: `pedido-${code ?? "missing"}`,
      codigo: `PED-${code ?? "missing"}`,
      dataHora: "2026-07-14 10:42:16-03",
      valorTotal: total,
      pedidoSituacao: code,
      pedidoSituacaoDescricao: description,
    },
    ConnectorProvider.MAGAZORD,
  );
}

describe("Magazord order status → approved revenue", () => {
  it.each([
    [1, "Aguardando Pagamento", false],
    [2, "Cancelado", false],
    [4, "Crédito e Cadastro Aprovados", true],
    [5, "Aprovado e Integrado", true],
    [6, "Nota Fiscal Emitida", true],
    [7, "Transporte", true],
    [8, "Entregue", true],
    [12, "Análise de Pagamento Aprovada", true],
    [23, "Faturamento Iniciado", true],
    [29, "Chargeback Recuperado", true],
  ])(
    "normalizes code %i (%s) with an explicit paid policy",
    (code, description, expectedApproved) => {
      const order = magazordOrder(code, description);

      expect(order.status).toBe(`MAGAZORD_STATUS_${code}`);
      expect(
        isApprovedOrderStatus(order.status, ConnectorProvider.MAGAZORD),
      ).toBe(expectedApproved);
    },
  );

  it("excludes cancelled and awaiting-payment amounts from the Magazord total", () => {
    const orders = [
      magazordOrder(2, "Cancelado", "700.00"),
      magazordOrder(1, "Aguardando Pagamento", "300.00"),
      magazordOrder(4, "Crédito e Cadastro Aprovados", "1250.50"),
      magazordOrder(7, "Transporte", "849.50"),
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

  it("fails closed when the Magazord status code is missing or unknown", () => {
    const missing = magazordOrder(undefined, "Aprovado");
    const unknown = magazordOrder(999, "Aprovado");

    expect(missing.status).toBe("MAGAZORD_STATUS_UNKNOWN");
    expect(
      isApprovedOrderStatus(missing.status, ConnectorProvider.MAGAZORD),
    ).toBe(false);
    expect(
      isApprovedOrderStatus(unknown.status, ConnectorProvider.MAGAZORD),
    ).toBe(false);
  });

  it("does not let Magazord fields override another provider status", () => {
    const order = normalizeManualCommerceOrder(
      {
        id: "other-provider-order",
        created_at: "2026-07-14T10:42:16.000Z",
        total: "100.00",
        status: "pago",
        pedidoSituacao: 2,
        pedidoSituacaoDescricao: "Cancelado",
      },
      ConnectorProvider.SHOPIFY,
    );

    expect(order.status).toBe("pago");
  });

  it("does not treat Transporte as paid outside Magazord", () => {
    expect(isApprovedOrderStatus("Transporte", ConnectorProvider.SHOPIFY)).toBe(
      false,
    );
  });
});
