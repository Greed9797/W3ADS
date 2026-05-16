import { callWithRetry } from "@/lib/connectors/retry";

import { getShopifyConfig, normalizeShopDomain, type ShopifyConfig } from "./oauth";

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

  constructor(status: number, body: string) {
    super(`Shopify API request failed with status ${status}`);
    this.name = "ShopifyApiError";
    this.status = status;
    this.body = body;
  }
}

async function fetchJson<T>(url: URL | string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new ShopifyApiError(response.status, body);
  }

  return JSON.parse(body) as T;
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

export class ShopifyClient {
  private readonly config: ShopifyConfig;
  private readonly fetchImpl: FetchLike;

  constructor(input: { config?: ShopifyConfig; fetchImpl?: FetchLike } = {}) {
    this.config = input.config ?? getShopifyConfig();
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
}
