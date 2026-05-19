import { ConnectorProvider } from "@prisma/client";

import type { ShopifyOrder } from "@/lib/connectors/shopify/client";

export type ManualProviderCredentials = {
  provider: ConnectorProvider;
  storeName: string;
  baseUrl: string;
  apiKey?: string;
  apiSecret?: string;
  apiUser?: string;
  apiPassword?: string;
};

export type ManualCommerceOrderPayload = Record<string, unknown>;

function asString(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  return String(value);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const normalized = asString(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function normalizeMoney(value: string | null) {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^\d,.-]/g, "");
  if (cleaned.includes(",") && cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
    return cleaned.replace(/\./g, "").replace(",", ".");
  }

  return cleaned;
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

export function normalizeManualProviderCredentials(input: ManualProviderCredentials) {
  return {
    provider: input.provider,
    storeName: input.storeName.trim(),
    baseUrl:
      input.provider === ConnectorProvider.GOOGLE_SHEETS
        ? input.baseUrl.trim()
        : normalizeBaseUrl(input.baseUrl),
    apiKey: input.apiKey?.trim() || undefined,
    apiSecret: input.apiSecret?.trim() || undefined,
    apiUser: input.apiUser?.trim() || undefined,
    apiPassword: input.apiPassword?.trim() || undefined,
  };
}

function sumItemsCount(value: unknown) {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.reduce((sum, item) => {
    if (!item || typeof item !== "object") {
      return sum;
    }

    const record = item as Record<string, unknown>;
    const quantity = Number(record.quantidade ?? record.quantity ?? record.qtd ?? 1);

    return sum + (Number.isFinite(quantity) ? quantity : 1);
  }, 0);
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const record = item as Record<string, unknown>;
    const quantity = Number(record.quantidade ?? record.quantity ?? record.qtd ?? 1);

    return [
      {
        productName:
          firstString(record.nome, record.name, record.product_name, record.title) ??
          `Produto ${index + 1}`,
        sku: firstString(record.sku, record.codigo_sku, record.reference),
        quantity: Number.isFinite(quantity) ? quantity : 1,
        total: firstString(record.total, record.valor_total, record.price, record.preco),
      },
    ];
  });
}

export function normalizeManualCommerceOrder(payload: ManualCommerceOrderPayload): ShopifyOrder {
  const externalOrderId = firstString(
    payload.id,
    payload.order_id,
    payload.id_pedido,
    payload.pedido_id,
    payload.codigo,
    payload.numero,
    payload.pedido,
    payload.numero_pedido,
    payload.number,
    payload.whatsapp_id,
    payload.telefone,
    payload.phone,
  );
  if (!externalOrderId) {
    throw new Error("Manual commerce order is missing an id");
  }

  const placedAt =
    firstString(
      payload.created_at,
      payload.data,
      payload.data_pedido,
      payload.data_do_pedido,
      payload.criado_em,
      payload.date,
      payload.placed_at,
    ) ?? new Date().toISOString();

  return {
    externalOrderId,
    orderNumber: firstString(payload.numero, payload.pedido, payload.number, payload.order_number),
    orderTotal:
      normalizeMoney(
        firstString(
        payload.total,
        payload.valor_total,
        payload.total_price,
        payload.valor,
        payload.faturamento,
        payload.receita,
        payload.aprovado,
        ),
      ) ?? "0",
    orderCurrency: firstString(payload.moeda, payload.currency, payload.orderCurrency) ?? "BRL",
    customerEmail: firstString(payload.email, payload.customer_email, payload.cliente_email),
    itemsCount: sumItemsCount(payload.itens ?? payload.items ?? payload.line_items),
    items: normalizeItems(payload.itens ?? payload.items ?? payload.line_items),
    status:
      firstString(
        payload.status,
        payload.situacao,
        payload.payment_status,
        payload.status_pagamento,
        payload.aprovacao,
      ) ?? "APPROVED",
    shippingState: firstString(
      payload.uf,
      payload.estado,
      payload.estado_uf,
      payload.state,
      payload.shipping_state,
      (payload.shipping_address as Record<string, unknown> | undefined)?.province_code,
      (payload.shipping_address as Record<string, unknown> | undefined)?.state,
    ),
    placedAt,
    utmSource: firstString(payload.utm_source, payload.origem, payload.source),
    utmMedium: firstString(payload.utm_medium, payload.midia, payload.medium),
    utmCampaign: firstString(payload.utm_campaign, payload.campanha, payload.campaign),
  };
}
