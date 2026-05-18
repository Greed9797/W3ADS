import { callWithRetry } from "@/lib/connectors/retry";

import type { MetaConfig } from "./oauth";

type FetchLike = typeof fetch;

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaAdAccountResponse = {
  data?: Array<{
    id: string;
    name?: string;
    account_id?: string;
    currency?: string;
    timezone_name?: string;
  }>;
  paging?: {
    next?: string;
  };
};

type MetaInsightAction = {
  action_type?: string;
  value?: string;
};

type MetaInsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaInsightAction[];
  action_values?: MetaInsightAction[];
  date_start: string;
  date_stop: string;
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  paging?: {
    next?: string;
  };
};

export type MetaAdAccount = {
  id: string;
  name: string;
  accountId: string;
  currency?: string;
  timezoneName?: string;
};

export type MetaCampaignInsight = {
  campaignId: string | null;
  campaignName: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  conversions: string | null;
  conversionsValue: string | null;
  dateStart: string;
  dateStop: string;
};

const purchaseActionTypes = [
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "purchase",
] as const;

export class MetaApiError extends Error {
  status: number;
  body: string;
  response: {
    status: number;
    headers: Headers;
  };

  constructor(status: number, body: string, headers = new Headers()) {
    super(`Meta API request failed with status ${status}`);
    this.name = "MetaApiError";
    this.status = status;
    this.body = body;
    this.response = { status, headers };
  }
}

async function fetchJson<T>(url: URL | string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new MetaApiError(response.status, body, response.headers);
  }

  const retryAfter = parseMetaBusinessUsageRetryAfter(
    response.headers.get("x-business-use-case-usage"),
  );
  if (retryAfter) {
    const headers = new Headers(response.headers);
    headers.set("retry-after", retryAfter);
    throw new MetaApiError(429, "Meta business usage above the connector threshold", headers);
  }

  return JSON.parse(body) as T;
}

export class MetaMarketingClient {
  private readonly config: MetaConfig;
  private readonly fetchImpl: FetchLike;

  constructor(input: { config: MetaConfig; fetchImpl?: FetchLike }) {
    this.config = input.config;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  async exchangeCodeForShortLivedToken(code: string) {
    const body = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: this.config.redirectUri,
      code,
    });

    return callWithRetry(() =>
      fetchJson<MetaTokenResponse>(
        `https://graph.facebook.com/${this.config.apiVersion}/oauth/access_token`,
        this.fetchImpl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
      ),
    );
  }

  async exchangeForLongLivedToken(accessToken: string) {
    const body = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: accessToken,
    });

    return callWithRetry(() =>
      fetchJson<MetaTokenResponse>(
        `https://graph.facebook.com/${this.config.apiVersion}/oauth/access_token`,
        this.fetchImpl,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        },
      ),
    );
  }

  async listAdAccounts(accessToken: string) {
    const accounts: MetaAdAccount[] = [];
    let nextUrl: string | undefined;

    const firstUrl = new URL(`https://graph.facebook.com/${this.config.apiVersion}/me/adaccounts`);
    firstUrl.searchParams.set("fields", "id,name,account_id,currency,timezone_name");
    firstUrl.searchParams.set("limit", "100");
    nextUrl = firstUrl.toString();

    while (nextUrl) {
      const page = await callWithRetry(() =>
        fetchJson<MetaAdAccountResponse>(nextUrl as string, this.fetchImpl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }),
      );

      for (const account of page.data ?? []) {
        accounts.push({
          id: account.id,
          name: account.name ?? account.id,
          accountId: account.account_id ?? account.id.replace(/^act_/, ""),
          currency: account.currency,
          timezoneName: account.timezone_name,
        });
      }

      nextUrl = page.paging?.next;
    }

    return accounts;
  }

  async getCampaignInsights(input: {
    accessToken: string;
    adAccountId: string;
    since: string;
    until: string;
  }) {
    const insights: MetaCampaignInsight[] = [];
    let nextUrl: string | undefined;
    const accountPath = input.adAccountId.startsWith("act_")
      ? input.adAccountId
      : `act_${input.adAccountId}`;

    const firstUrl = new URL(
      `https://graph.facebook.com/${this.config.apiVersion}/${accountPath}/insights`,
    );
    firstUrl.searchParams.set("level", "campaign");
    firstUrl.searchParams.set(
      "fields",
      [
        "campaign_id",
        "campaign_name",
        "spend",
        "impressions",
        "clicks",
        "actions",
        "action_values",
        "date_start",
        "date_stop",
      ].join(","),
    );
    firstUrl.searchParams.set(
      "time_range",
      JSON.stringify({ since: input.since, until: input.until }),
    );
    firstUrl.searchParams.set("action_attribution_windows", JSON.stringify(["7d_click", "1d_view"]));
    firstUrl.searchParams.set("time_increment", "1");
    firstUrl.searchParams.set("limit", "500");
    nextUrl = firstUrl.toString();

    while (nextUrl) {
      const page = await callWithRetry(() =>
        fetchJson<MetaInsightsResponse>(nextUrl as string, this.fetchImpl, {
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
          },
        }),
      );

      insights.push(...(page.data ?? []).map(normalizeMetaInsight));
      nextUrl = page.paging?.next;
    }

    return insights;
  }
}

function findHighUsage(value: unknown): boolean {
  if (typeof value === "number") {
    return value > 75;
  }

  if (Array.isArray(value)) {
    return value.some(findHighUsage);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, nested]) => {
    if (["call_count", "total_cputime", "total_time"].includes(key)) {
      return findHighUsage(nested);
    }

    return findHighUsage(nested);
  });
}

export function parseMetaBusinessUsageRetryAfter(header: string | null) {
  if (!header) {
    return null;
  }

  try {
    return findHighUsage(JSON.parse(header)) ? "3600" : null;
  } catch {
    return null;
  }
}

export function tokenExpiresAt(expiresInSeconds: number | undefined) {
  if (!expiresInSeconds) {
    return null;
  }

  return new Date(Date.now() + expiresInSeconds * 1000);
}

function findPurchaseMetric(actions: MetaInsightAction[] | undefined) {
  for (const actionType of purchaseActionTypes) {
    const value = actions?.find((action) => action.action_type === actionType)?.value;
    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeMetaInsight(row: MetaInsightRow): MetaCampaignInsight {
  return {
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    spend: row.spend ?? null,
    impressions: row.impressions ?? null,
    clicks: row.clicks ?? null,
    conversions: findPurchaseMetric(row.actions),
    conversionsValue: findPurchaseMetric(row.action_values),
    dateStart: row.date_start,
    dateStop: row.date_stop,
  };
}
