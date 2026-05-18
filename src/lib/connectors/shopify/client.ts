import { callWithRetry } from "@/lib/connectors/retry";

import { normalizeShopDomain, type ShopifyConfig } from "./oauth";

type FetchLike = typeof fetch;

type ShopifyTokenResponse = {
  access_token: string;
  scope?: string;
};

type ShopifyOrderNode = {
  id: string;
  name?: string;
  createdAt: string;
  displayFinancialStatus?: string;
  totalPriceSet?: {
    shopMoney?: {
      amount?: string;
      currencyCode?: string;
    };
  };
  customer?: {
    email?: string | null;
  } | null;
  lineItems?: {
    edges?: Array<{
      node?: {
        quantity?: number;
      };
    }>;
  };
  customAttributes?: Array<{
    key?: string;
    value?: string;
  }>;
  landingSite?: string | null;
  referringSite?: string | null;
};

type ShopifyWebhookOrderPayload = {
  id?: number | string;
  admin_graphql_api_id?: string;
  name?: string;
  created_at?: string;
  processed_at?: string;
  financial_status?: string;
  total_price?: string;
  currency?: string;
  email?: string | null;
  contact_email?: string | null;
  customer?: {
    email?: string | null;
  } | null;
  line_items?: Array<{
    quantity?: number;
  }>;
  note_attributes?: Array<{
    name?: string;
    key?: string;
    value?: string;
  }>;
  landing_site?: string | null;
  referring_site?: string | null;
};

type ShopifyOrdersResponse = {
  data?: {
    orders?: {
      edges?: Array<{
        cursor: string;
        node: ShopifyOrderNode;
      }>;
      pageInfo?: {
        hasNextPage: boolean;
        endCursor?: string | null;
      };
    };
  };
  errors?: unknown;
};

export type ShopifyOrder = {
  externalOrderId: string;
  orderNumber: string | null;
  orderTotal: string;
  orderCurrency: string;
  customerEmail: string | null;
  itemsCount: number;
  status: string;
  placedAt: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/paid",
  "app/uninstalled",
] as const;

const SHOPIFY_ORDERS_QUERY = `
query Orders($cursor: String, $query: String) {
  orders(first: 250, after: $cursor, query: $query, sortKey: CREATED_AT) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        customer { email }
        lineItems(first: 50) { edges { node { quantity } } }
        customAttributes { key value }
        landingSite
        referringSite
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}
`;

export class ShopifyApiError extends Error {
  status: number;
  body: string;
  response: {
    status: number;
    headers: Headers;
  };

  constructor(status: number, body: string, headers = new Headers()) {
    super(`Shopify API request failed with status ${status}`);
    this.name = "ShopifyApiError";
    this.status = status;
    this.body = body;
    this.response = { status, headers };
  }
}

async function fetchJson<T>(url: URL | string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new ShopifyApiError(response.status, body, response.headers);
  }

  return JSON.parse(body) as T;
}

function parseUtmFromValue(value: string | null | undefined) {
  if (!value) {
    return {};
  }

  try {
    const url = new URL(value, "https://shop.myshopify.com");

    return {
      utmSource: url.searchParams.get("utm_source"),
      utmMedium: url.searchParams.get("utm_medium"),
      utmCampaign: url.searchParams.get("utm_campaign"),
    };
  } catch {
    return {};
  }
}

function customAttributeValue(
  attributes: ShopifyWebhookOrderPayload["note_attributes"],
  key: string,
) {
  return attributes?.find((attribute) => (attribute.key ?? attribute.name) === key)?.value ?? null;
}

export function normalizeShopifyOrder(node: ShopifyOrderNode): ShopifyOrder {
  const customAttributes = new Map(
    (node.customAttributes ?? []).map((attribute) => [attribute.key, attribute.value]),
  );
  const itemsCount =
    node.lineItems?.edges?.reduce((sum, edge) => sum + (edge.node?.quantity ?? 0), 0) ?? 0;

  return {
    externalOrderId: node.id,
    orderNumber: node.name ?? null,
    orderTotal: node.totalPriceSet?.shopMoney?.amount ?? "0",
    orderCurrency: node.totalPriceSet?.shopMoney?.currencyCode ?? "BRL",
    customerEmail: node.customer?.email ?? null,
    itemsCount,
    status: node.displayFinancialStatus ?? "UNKNOWN",
    placedAt: node.createdAt,
    utmSource: customAttributes.get("utm_source") ?? null,
    utmMedium: customAttributes.get("utm_medium") ?? null,
    utmCampaign: customAttributes.get("utm_campaign") ?? null,
  };
}

export function normalizeShopifyWebhookOrder(payload: ShopifyWebhookOrderPayload): ShopifyOrder {
  const utmFromLandingSite = parseUtmFromValue(payload.landing_site);
  const id = payload.admin_graphql_api_id ?? `gid://shopify/Order/${payload.id ?? ""}`;

  return {
    externalOrderId: id,
    orderNumber: payload.name ?? null,
    orderTotal: payload.total_price ?? "0",
    orderCurrency: payload.currency ?? "BRL",
    customerEmail: payload.email ?? payload.contact_email ?? payload.customer?.email ?? null,
    itemsCount:
      payload.line_items?.reduce((sum, lineItem) => sum + (lineItem.quantity ?? 0), 0) ?? 0,
    status: payload.financial_status?.toUpperCase() ?? "UNKNOWN",
    placedAt: payload.processed_at ?? payload.created_at ?? new Date().toISOString(),
    utmSource:
      customAttributeValue(payload.note_attributes, "utm_source") ?? utmFromLandingSite.utmSource,
    utmMedium:
      customAttributeValue(payload.note_attributes, "utm_medium") ?? utmFromLandingSite.utmMedium,
    utmCampaign:
      customAttributeValue(payload.note_attributes, "utm_campaign") ??
      utmFromLandingSite.utmCampaign,
  };
}

export function buildShopifyWebhookAddress(input: { redirectUri: string }) {
  return new URL("/api/webhooks/shopify", input.redirectUri).toString();
}

function shouldIgnoreWebhookCreateError(error: unknown) {
  return (
    error instanceof ShopifyApiError &&
    error.status === 422 &&
    /already|taken|address/i.test(error.body)
  );
}

export class ShopifyClient {
  private readonly config: ShopifyConfig;
  private readonly fetchImpl: FetchLike;

  constructor(input: { config: ShopifyConfig; fetchImpl?: FetchLike }) {
    this.config = input.config;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async exchangeCodeForAccessToken(input: { shop: string; code: string }) {
    const shop = normalizeShopDomain(input.shop);
    const body = new URLSearchParams({
      client_id: this.config.apiKey,
      client_secret: this.config.apiSecret,
      code: input.code,
    });

    return callWithRetry(() =>
      fetchJson<ShopifyTokenResponse>(`https://${shop}/admin/oauth/access_token`, this.fetchImpl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
  }

  async listOrders(input: { shop: string; accessToken: string; since: string; until: string }) {
    const shop = normalizeShopDomain(input.shop);
    const orders: ShopifyOrder[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;
    const query = `created_at:>=${input.since} created_at:<=${input.until}`;

    while (hasNextPage) {
      const response = await callWithRetry(() =>
        fetchJson<ShopifyOrdersResponse>(
          `https://${shop}/admin/api/${this.config.apiVersion}/graphql.json`,
          this.fetchImpl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": input.accessToken,
            },
            body: JSON.stringify({
              query: SHOPIFY_ORDERS_QUERY,
              variables: { cursor, query },
            }),
          },
        ),
      );

      if (response.errors) {
        throw new Error("Shopify GraphQL returned errors");
      }

      const connection = response.data?.orders;
      orders.push(...(connection?.edges ?? []).map((edge) => normalizeShopifyOrder(edge.node)));
      hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
      cursor = connection?.pageInfo?.endCursor ?? null;
    }

    return orders;
  }

  async ensureWebhookSubscriptions(input: { shop: string; accessToken: string }) {
    const shop = normalizeShopDomain(input.shop);
    const address = buildShopifyWebhookAddress({ redirectUri: this.config.redirectUri });

    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
      try {
        await callWithRetry(() =>
          fetchJson<unknown>(
            `https://${shop}/admin/api/${this.config.apiVersion}/webhooks.json`,
            this.fetchImpl,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Shopify-Access-Token": input.accessToken,
              },
              body: JSON.stringify({
                webhook: {
                  topic,
                  address,
                  format: "json",
                },
              }),
            },
          ),
        );
      } catch (error) {
        if (!shouldIgnoreWebhookCreateError(error)) {
          throw error;
        }
      }
    }
  }
}
