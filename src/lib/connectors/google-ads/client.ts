import Decimal from "decimal.js";

import { callWithRetry } from "@/lib/connectors/retry";

import { getGoogleAdsConfig, type GoogleAdsConfig } from "./oauth";

type FetchLike = typeof fetch;

type GoogleAdsTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

type AccessibleCustomersResponse = {
  resourceNames?: string[];
};

type GoogleAdsMetricRow = {
  campaign?: {
    id?: string | number;
    name?: string;
  };
  metrics?: {
    costMicros?: string | number;
    impressions?: string | number;
    clicks?: string | number;
    conversions?: string | number;
    conversionsValue?: string | number;
  };
  segments?: {
    date?: string;
  };
};

type GoogleAdsSearchResponse = {
  results?: GoogleAdsMetricRow[];
  nextPageToken?: string;
};

export type GoogleAdsCampaignMetric = {
  campaignId: string | null;
  campaignName: string | null;
  spend: string | null;
  impressions: string | null;
  clicks: string | null;
  conversions: string | null;
  conversionsValue: string | null;
  date: string;
};

export const GOOGLE_ADS_CAMPAIGN_METRICS_QUERY = `
SELECT
  campaign.id,
  campaign.name,
  metrics.cost_micros,
  metrics.impressions,
  metrics.clicks,
  metrics.conversions,
  metrics.conversions_value,
  segments.date
FROM campaign
WHERE segments.date BETWEEN '{since}' AND '{until}'
`;

export class GoogleAdsApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Google Ads API request failed with status ${status}`);
    this.name = "GoogleAdsApiError";
    this.status = status;
    this.body = body;
  }
}

async function fetchJson<T>(url: URL | string, fetchImpl: FetchLike, init?: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  const body = await response.text();

  if (!response.ok) {
    throw new GoogleAdsApiError(response.status, body);
  }

  return JSON.parse(body) as T;
}

function asString(value: string | number | undefined | null) {
  return value === undefined || value === null ? null : String(value);
}

export function costMicrosToCurrency(value: string | number | undefined | null) {
  if (value === undefined || value === null) {
    return null;
  }

  return new Decimal(value).div(1_000_000).toDecimalPlaces(2).toString();
}

export function normalizeGoogleAdsMetricRow(row: GoogleAdsMetricRow): GoogleAdsCampaignMetric {
  return {
    campaignId: asString(row.campaign?.id),
    campaignName: row.campaign?.name ?? null,
    spend: costMicrosToCurrency(row.metrics?.costMicros),
    impressions: asString(row.metrics?.impressions),
    clicks: asString(row.metrics?.clicks),
    conversions: asString(row.metrics?.conversions),
    conversionsValue: asString(row.metrics?.conversionsValue),
    date: row.segments?.date ?? "",
  };
}

export class GoogleAdsClient {
  private readonly config: GoogleAdsConfig;
  private readonly fetchImpl: FetchLike;

  constructor(input: { config?: GoogleAdsConfig; fetchImpl?: FetchLike } = {}) {
    this.config = input.config ?? getGoogleAdsConfig();
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  private googleAdsHeaders(accessToken: string) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": this.config.developerToken,
      "Content-Type": "application/json",
    };

    if (this.config.loginCustomerId) {
      headers["login-customer-id"] = this.config.loginCustomerId;
    }

    return headers;
  }

  async exchangeCodeForTokens(code: string) {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: this.config.redirectUri,
    });

    return callWithRetry(() =>
      fetchJson<GoogleAdsTokenResponse>("https://oauth2.googleapis.com/token", this.fetchImpl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
  }

  async refreshAccessToken(refreshToken: string) {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    return callWithRetry(() =>
      fetchJson<GoogleAdsTokenResponse>("https://oauth2.googleapis.com/token", this.fetchImpl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
  }

  async listAccessibleCustomers(accessToken: string) {
    const url = `https://googleads.googleapis.com/${this.config.apiVersion}/customers:listAccessibleCustomers`;
    const response = await callWithRetry(() =>
      fetchJson<AccessibleCustomersResponse>(url, this.fetchImpl, {
        headers: this.googleAdsHeaders(accessToken),
      }),
    );

    return (response.resourceNames ?? []).map((resourceName) => ({
      resourceName,
      customerId: resourceName.replace("customers/", ""),
      displayName: `Google Ads ${resourceName.replace("customers/", "")}`,
    }));
  }

  async searchCampaignMetrics(input: {
    accessToken: string;
    customerId: string;
    since: string;
    until: string;
  }) {
    const metrics: GoogleAdsCampaignMetric[] = [];
    let pageToken: string | undefined;
    const query = GOOGLE_ADS_CAMPAIGN_METRICS_QUERY.replace("{since}", input.since).replace(
      "{until}",
      input.until,
    );
    const url = `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${input.customerId}/googleAds:search`;

    do {
      const response = await callWithRetry(() =>
        fetchJson<GoogleAdsSearchResponse>(url, this.fetchImpl, {
          method: "POST",
          headers: this.googleAdsHeaders(input.accessToken),
          body: JSON.stringify({
            query,
            pageToken,
            pageSize: 1000,
          }),
        }),
      );

      metrics.push(...(response.results ?? []).map(normalizeGoogleAdsMetricRow));
      pageToken = response.nextPageToken;
    } while (pageToken);

    return metrics.filter((metric) => metric.date);
  }
}
