import { callWithRetry } from "@/lib/connectors/retry";
import type { ShopifyOrder } from "@/lib/connectors/shopify/client";

type FetchLike = typeof fetch;

export type IsetConfig = {
  /** Store domain or full URL. Normalized to `https://{domain}/ws/v1`. */
  baseUrl: string;
  /** API user identifier (the `identifier` half of Basic auth). */
  identifier: string;
  /** API access key (the `secret` half of Basic auth). */
  secret: string;
};

type IsetOAuthResponse = {
  status?: number;
  token?: string;
  expires_in?: number;
};

type IsetOrder = {
  orderId?: number;
  orderTotal?: number;
  orderTotalPaid?: number;
  statusId?: number;
  orderIsComplete?: boolean;
  datePurchased?: string;
  lastModified?: string;
  datePaid?: string | null;
  currency?: string;
};

type IsetOrderListResponse = {
  status?: number;
  offset?: string;
  ordersFound?: number;
  ordersTotal?: number;
  orders?: IsetOrder[];
};

const DEFAULT_USER_AGENT = "W3Ads-Connector/1.0";
const PAGE_SIZE = 50;
const MAX_PAGES = 200; // safety cap: 200 * 50 = 10k orders per sync window

export class IsetApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`iSET API ${status}: ${body.slice(0, 220)}`);
    this.name = "IsetApiError";
    this.status = status;
    this.body = body;
  }
}

/** Normalizes "www.loja.com.br" or "https://loja.com.br/" → "https://loja.com.br/ws/v1". */
function normalizeIsetBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("ISET baseUrl is required");
  }
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const url = new URL(withProtocol);
  const host = `${url.protocol}//${url.host}`;
  const path = url.pathname.replace(/\/+$/, "");
  if (/\/ws\/v1$/i.test(path)) {
    return `${host}${path}`;
  }
  return `${host}/ws/v1`;
}

/** iSET returns datePurchased as "YYYY-MM-DD HH:MM:SS" (store local time). */
function isetDateToIso(value: string | undefined): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  // Make it ISO-ish so Date.parse is deterministic across runtimes.
  return trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T");
}

/**
 * Maps an iSET order to the shared normalized shape. Status is derived so the
 * downstream `isApprovedOrderStatus` filter only counts paid/complete orders
 * toward revenue.
 */
function normalizeIsetOrder(order: IsetOrder): ShopifyOrder {
  const status = order.datePaid
    ? "paid"
    : order.orderIsComplete
      ? "completed"
      : "pending";

  return {
    externalOrderId: String(order.orderId ?? ""),
    orderNumber: order.orderId != null ? `#${order.orderId}` : null,
    orderTotal: String(order.orderTotal ?? 0),
    orderCurrency: order.currency ?? "BRL",
    customerEmail: null,
    itemsCount: 1,
    status,
    placedAt: isetDateToIso(order.datePurchased),
  };
}

export class IsetClient {
  private readonly baseUrl: string;
  private readonly identifier: string;
  private readonly secret: string;
  private readonly fetchImpl: FetchLike;
  private token: string | null = null;

  constructor(input: { config: IsetConfig; fetchImpl?: FetchLike }) {
    this.baseUrl = normalizeIsetBaseUrl(input.config.baseUrl);
    this.identifier = input.config.identifier?.trim() ?? "";
    this.secret = input.config.secret?.trim() ?? "";
    this.fetchImpl = input.fetchImpl ?? fetch;

    if (!this.identifier || !this.secret) {
      throw new Error("ISET identifier and secret are required");
    }
  }

  /** POST /oauth with Basic auth → access token (valid 15 min). */
  private async authenticate(): Promise<string> {
    const basic = Buffer.from(`${this.identifier}:${this.secret}`).toString(
      "base64",
    );
    const response = await callWithRetry(
      () =>
        this.fetchImpl(`${this.baseUrl}/oauth`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            Accept: "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
          },
          signal: AbortSignal.timeout(20_000),
        }),
      { maxAttempts: 3 },
    );
    const body = await response.text();
    if (!response.ok) {
      throw new IsetApiError(response.status, body);
    }
    const parsed = JSON.parse(body) as IsetOAuthResponse;
    if (!parsed.token) {
      throw new IsetApiError(response.status, "iSET oauth returned no token");
    }
    this.token = parsed.token;
    return parsed.token;
  }

  private async ensureToken(): Promise<string> {
    return this.token ?? this.authenticate();
  }

  private async fetchOrderPage(input: {
    since: string;
    until: string;
    offset: string;
    retryOnAuth?: boolean;
  }): Promise<IsetOrderListResponse> {
    const token = await this.ensureToken();
    const response = await this.fetchImpl(`${this.baseUrl}/order/list`, {
      method: "POST",
      headers: {
        "access-token": token,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
      },
      body: JSON.stringify({
        date: {
          from: input.since.slice(0, 10),
          to: input.until.slice(0, 10),
        },
        order: "orders_id",
        order_type: "asc",
        offset: input.offset,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await response.text();

    // Token expired (15 min) — re-auth once and retry.
    if (response.status === 401 && input.retryOnAuth !== false) {
      this.token = null;
      return this.fetchOrderPage({ ...input, retryOnAuth: false });
    }
    if (!response.ok) {
      throw new IsetApiError(response.status, body);
    }
    return JSON.parse(body) as IsetOrderListResponse;
  }

  /** Lists orders in the [since, until] window, paginating until exhausted. */
  async listOrders(input: {
    since: string;
    until: string;
  }): Promise<ShopifyOrder[]> {
    const out: ShopifyOrder[] = [];
    let cursor = 0;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      // iSET offset format: "offset,limit".
      const offset = `${cursor},${PAGE_SIZE}`;
      const data = await callWithRetry(
        () =>
          this.fetchOrderPage({
            since: input.since,
            until: input.until,
            offset,
          }),
        { maxAttempts: 3 },
      );
      const orders = data.orders ?? [];
      for (const order of orders) {
        out.push(normalizeIsetOrder(order));
      }
      if (orders.length < PAGE_SIZE) {
        break;
      }
      cursor += PAGE_SIZE;
    }

    return out;
  }
}
