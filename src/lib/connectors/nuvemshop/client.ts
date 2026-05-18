import { callWithRetry } from "@/lib/connectors/retry";
import type { ShopifyOrder } from "@/lib/connectors/shopify/client";

import type { NuvemshopConfig } from "./oauth";

type FetchLike = typeof fetch;

type NuvemshopTokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  user_id: string | number;
};

type NuvemshopOrderPayload = {
  id?: string | number;
  number?: string | number;
  contact_email?: string | null;
  email?: string | null;
  total?: string | number;
  total_paid?: string | number;
  currency?: string;
  status?: string;
  payment_status?: string;
  created_at?: string;
  completed_at?: string | null;
  paid_at?: string | null;
  products?: Array<{ quantity?: string | number }>;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
};

export type NuvemshopToken = {
  accessToken: string;
  tokenType: string;
  scope: string | null;
  storeId: string;
};

export class NuvemshopApiError extends Error {
  status: number;
  body: string;
  response: {
    status: number;
    headers: Headers;
  };

  constructor(status: number, body: string, headers = new Headers()) {
    super(`Nuvemshop API request failed with status ${status}`);
    this.name = "NuvemshopApiError";
    this.status = status;
    this.body = body;
    this.response = { status, headers };
  }
}

async function fetchJson<T>(url: URL | string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new NuvemshopApiError(response.status, body, response.headers);
  }

  return JSON.parse(body) as T;
}

async function fetchJsonWithHeaders<T>(
  url: URL | string,
  fetchImpl: FetchLike,
  init?: RequestInit,
): Promise<{ data: T; headers: Headers }> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new NuvemshopApiError(response.status, body, response.headers);
  }

  return {
    data: JSON.parse(body) as T,
    headers: response.headers,
  };
}

function asString(value: string | number | undefined | null) {
  return value === undefined || value === null ? null : String(value);
}

function normalizeNuvemshopOrder(order: NuvemshopOrderPayload): ShopifyOrder {
  const externalOrderId = asString(order.id);
  if (!externalOrderId) {
    throw new Error("Nuvemshop order is missing id");
  }

  return {
    externalOrderId,
    orderNumber: asString(order.number),
    orderTotal: asString(order.total_paid ?? order.total) ?? "0",
    orderCurrency: order.currency ?? "BRL",
    customerEmail: order.contact_email ?? order.email ?? null,
    itemsCount:
      order.products?.reduce((sum, item) => {
        const quantity = Number(item.quantity ?? 1);

        return sum + (Number.isFinite(quantity) ? quantity : 1);
      }, 0) ?? 0,
    status: order.payment_status ?? order.status ?? "UNKNOWN",
    placedAt: order.paid_at ?? order.completed_at ?? order.created_at ?? new Date().toISOString(),
    utmSource: order.utm_source ?? null,
    utmMedium: order.utm_medium ?? null,
    utmCampaign: order.utm_campaign ?? null,
  };
}

export class NuvemshopClient {
  private readonly config: NuvemshopConfig;
  private readonly fetchImpl: FetchLike;

  constructor(input: { config: NuvemshopConfig; fetchImpl?: FetchLike }) {
    this.config = input.config;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async exchangeCodeForAccessToken(code: string): Promise<NuvemshopToken> {
    const body = JSON.stringify({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "authorization_code",
      code,
    });
    const response = await callWithRetry(() =>
      fetchJson<NuvemshopTokenResponse>(
        "https://www.tiendanube.com/apps/authorize/token",
        this.fetchImpl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        },
      ),
    );

    return {
      accessToken: response.access_token,
      tokenType: response.token_type ?? "bearer",
      scope: response.scope ?? null,
      storeId: String(response.user_id),
    };
  }

  private ordersUrl(input: { storeId: string; since: string; until: string; page: number }) {
    const url = new URL(`${this.config.apiBaseUrl}/${input.storeId}/orders`);
    url.searchParams.set("created_at_min", `${input.since}T00:00:00Z`);
    url.searchParams.set("created_at_max", `${input.until}T23:59:59Z`);
    url.searchParams.set("status", "any");
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("per_page", "200");

    return url;
  }

  private nextLink(headers: Headers) {
    const link = headers.get("Link") ?? headers.get("link");
    if (!link) {
      return null;
    }

    for (const part of link.split(",")) {
      const match = part.match(/<([^>]+)>;\s*rel="?next"?/i);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  async listOrders(input: {
    storeId: string;
    accessToken: string;
    since: string;
    until: string;
  }) {
    const orders: ShopifyOrder[] = [];
    let page = 1;
    let nextUrl: URL | string | null = this.ordersUrl({ ...input, page });

    while (nextUrl) {
      const response = await callWithRetry(() =>
        fetchJsonWithHeaders<NuvemshopOrderPayload[]>(nextUrl as URL | string, this.fetchImpl, {
          headers: {
            Authentication: `bearer ${input.accessToken}`,
            "User-Agent": "W3ADS (integracoes@w3educacao.com.br)",
          },
        }),
      );

      orders.push(...response.data.map(normalizeNuvemshopOrder));

      page += 1;
      nextUrl =
        this.nextLink(response.headers) ??
        (response.data.length === 200 ? this.ordersUrl({ ...input, page }) : null);
    }

    return orders;
  }
}
