import { ConnectorProvider } from "@prisma/client";

import { callWithRetry } from "@/lib/connectors/retry";
import type { ConnectorCredentialPayload } from "@/lib/connectors/credentials";

type FetchLike = typeof fetch;

function credentialString(credentials: ConnectorCredentialPayload, key: string) {
  const value = credentials[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function appendPath(baseUrl: string, path: string) {
  return new URL(path.startsWith("/") ? path : `/${path}`, baseUrl).toString();
}

function buildHeaders(credentials: ConnectorCredentialPayload) {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const apiKey = credentialString(credentials, "apiKey");
  const apiSecret = credentialString(credentials, "apiSecret");
  const apiUser = credentialString(credentials, "apiUser");
  const apiPassword = credentialString(credentials, "apiPassword");

  if (apiUser && apiPassword) {
    headers.Authorization = `Basic ${Buffer.from(`${apiUser}:${apiPassword}`).toString("base64")}`;
  } else if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
  }

  if (apiSecret) {
    headers["X-Api-Secret"] = apiSecret;
  }

  return headers;
}

function extractOrderPayloads(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;

  for (const key of ["orders", "pedidos", "data", "items", "results"]) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return nested.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
  }

  return [];
}

export class ManualCommerceClient {
  private readonly provider: ConnectorProvider;
  private readonly credentials: ConnectorCredentialPayload;
  private readonly fetchImpl: FetchLike;

  constructor(input: {
    provider: ConnectorProvider;
    credentials: ConnectorCredentialPayload;
    fetchImpl?: FetchLike;
  }) {
    this.provider = input.provider;
    this.credentials = input.credentials;
    this.fetchImpl = input.fetchImpl ?? fetch;
  }

  private ordersUrl(range?: { since: string; until: string }) {
    const baseUrl = credentialString(this.credentials, "baseUrl");
    if (!baseUrl) {
      throw new Error(`${this.provider} baseUrl is required`);
    }

    const url = new URL(
      appendPath(baseUrl, credentialString(this.credentials, "ordersPath") ?? "/orders"),
    );

    if (range) {
      url.searchParams.set("created_at_min", range.since);
      url.searchParams.set("created_at_max", range.until);
      url.searchParams.set("updated_at_min", range.since);
      url.searchParams.set("limit", "200");
    } else {
      url.searchParams.set("limit", "1");
    }

    return url;
  }

  async healthCheck() {
    const response = await callWithRetry(() =>
      this.fetchImpl(this.ordersUrl(), {
        headers: buildHeaders(this.credentials),
      }),
    );

    if (!response.ok) {
      throw new Error(`${this.provider} credentials failed with status ${response.status}`);
    }

    return { ok: true };
  }

  async listOrders(range: { since: string; until: string }) {
    const response = await callWithRetry(() =>
      this.fetchImpl(this.ordersUrl(range), {
        headers: buildHeaders(this.credentials),
      }),
    );

    if (!response.ok) {
      throw new Error(`${this.provider} orders failed with status ${response.status}`);
    }

    return extractOrderPayloads(await response.json());
  }
}
