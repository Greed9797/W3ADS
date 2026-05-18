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
    baseUrl: normalizeBaseUrl(input.baseUrl),
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

export function normalizeManualCommerceOrder(payload: ManualCommerceOrderPayload): ShopifyOrder {
  const externalOrderId = firstString(
    payload.id,
    payload.order_id,
    payload.codigo,
    payload.numero,
    payload.number,
  );
  if (!externalOrderId) {
    throw new Error("Manual commerce order is missing an id");
  }

  const placedAt =
    firstString(
      payload.created_at,
      payload.data,
      payload.data_pedido,
      payload.date,
      payload.placed_at,
    ) ?? new Date().toISOString();

  return {
    externalOrderId,
    orderNumber: firstString(payload.numero, payload.number, payload.order_number),
    orderTotal: firstString(payload.total, payload.valor_total, payload.total_price, payload.valor) ?? "0",
    orderCurrency: firstString(payload.moeda, payload.currency, payload.orderCurrency) ?? "BRL",
    customerEmail: firstString(payload.email, payload.customer_email, payload.cliente_email),
    itemsCount: sumItemsCount(payload.itens ?? payload.items ?? payload.line_items),
    status: firstString(payload.status, payload.situacao, payload.payment_status) ?? "UNKNOWN",
    placedAt,
    utmSource: firstString(payload.utm_source),
    utmMedium: firstString(payload.utm_medium),
    utmCampaign: firstString(payload.utm_campaign),
  };
}
