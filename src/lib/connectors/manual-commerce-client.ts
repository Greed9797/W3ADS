import { ConnectorProvider } from "@prisma/client";

import { callWithRetry } from "@/lib/connectors/retry";
import type { ConnectorCredentialPayload } from "@/lib/connectors/credentials";

type FetchLike = typeof fetch;

const WBUY_API_BASE_URL = "https://sistema.sistemawbuy.com.br/api/v1";
const DEFAULT_USER_AGENT = "W3ADS (integracoes@w3educacao.com.br)";

function credentialString(credentials: ConnectorCredentialPayload, key: string) {
  const value = credentials[key];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);

  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

function appendPath(baseUrl: string, path: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");

  return `${cleanBase}/${cleanPath}`;
}

function appendIsetBasePath(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (/\/ws\/v1$/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}/ws/v1`;
}

function providerBaseUrl(provider: ConnectorProvider, credentials: ConnectorCredentialPayload) {
  const configuredBaseUrl = credentialString(credentials, "baseUrl");

  if (provider === ConnectorProvider.GOOGLE_SHEETS) {
    if (!configuredBaseUrl) {
      throw new Error("GOOGLE_SHEETS baseUrl is required");
    }

    return configuredBaseUrl.trim();
  }

  if (provider === ConnectorProvider.WBUY) {
    return configuredBaseUrl ? normalizeBaseUrl(configuredBaseUrl) : WBUY_API_BASE_URL;
  }

  if (!configuredBaseUrl) {
    throw new Error(`${provider} baseUrl is required`);
  }

  if (provider === ConnectorProvider.ISET) {
    return appendIsetBasePath(configuredBaseUrl);
  }

  return normalizeBaseUrl(configuredBaseUrl);
}

function providerOrdersPath(provider: ConnectorProvider, credentials: ConnectorCredentialPayload) {
  const configuredPath = credentialString(credentials, "ordersPath");
  if (configuredPath) {
    return configuredPath;
  }

  switch (provider) {
    case ConnectorProvider.WBUY:
      return "/order";
    case ConnectorProvider.ISET:
    case ConnectorProvider.MAGAZORD:
      return "/pedidos";
    default:
      return "/orders";
  }
}

function buildHeaders(provider: ConnectorProvider, credentials: ConnectorCredentialPayload) {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": DEFAULT_USER_AGENT,
  };
  const apiKey = credentialString(credentials, "apiKey");
  const apiSecret = credentialString(credentials, "apiSecret");
  const apiUser = credentialString(credentials, "apiUser");
  const apiPassword = credentialString(credentials, "apiPassword");

  if (provider === ConnectorProvider.GOOGLE_SHEETS) {
    return headers;
  }

  if (provider === ConnectorProvider.TRAY) {
    return headers;
  }

  if (provider === ConnectorProvider.WBUY) {
    if (apiUser && apiPassword) {
      headers.Authorization = `Bearer ${Buffer.from(`${apiUser}:${apiPassword}`).toString(
        "base64",
      )}`;
    } else if (apiKey) {
      headers["x-token"] = apiKey;
    }

    return headers;
  }

  if (provider === ConnectorProvider.ISET) {
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers["X-Integration-Key"] = apiKey;
    }

    return headers;
  }

  if (provider === ConnectorProvider.MAGAZORD) {
    if (apiUser && apiPassword) {
      headers.Authorization = `Basic ${Buffer.from(`${apiUser}:${apiPassword}`).toString(
        "base64",
      )}`;
    }
    if (apiKey) {
      headers["X-Api-Token"] = apiKey;
    }

    return headers;
  }

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

function appendProviderQueryParams(
  provider: ConnectorProvider,
  url: URL,
  credentials: ConnectorCredentialPayload,
) {
  if (provider === ConnectorProvider.TRAY) {
    const accessToken = credentialString(credentials, "apiKey");
    if (accessToken) {
      url.searchParams.set("access_token", accessToken);
    }
  }
}

function sheetIdFromUrl(value: string) {
  const match = value.match(/\/spreadsheets\/d\/([^/]+)/);
  if (match?.[1]) {
    return match[1];
  }

  return value.trim();
}

function sheetGidFromUrl(value: string, fallback?: string) {
  try {
    const url = new URL(value);
    return url.searchParams.get("gid") ?? fallback ?? "0";
  } catch {
    return fallback ?? "0";
  }
}

function googleSheetsCsvUrl(credentials: ConnectorCredentialPayload) {
  const baseUrl = credentialString(credentials, "baseUrl");
  if (!baseUrl) {
    throw new Error("GOOGLE_SHEETS baseUrl is required");
  }

  const gid = credentialString(credentials, "ordersPath");
  const sheetId = sheetIdFromUrl(baseUrl);
  const sheetGid = sheetGidFromUrl(baseUrl, gid);

  return new URL(
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(
      sheetGid,
    )}`,
  );
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((cell) => cell.trim().length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim().length > 0)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function extractGoogleSheetPayloads(csv: string): Record<string, unknown>[] {
  const rows = parseCsvRows(csv);
  const [headers, ...dataRows] = rows;
  if (!headers?.length) {
    return [];
  }
  const normalizedHeaders = headers.map(normalizeHeader);

  return dataRows
    .map((cells) =>
      Object.fromEntries(
        normalizedHeaders.map((header, index) => [header, cells[index]?.trim() ?? ""]),
      ),
    )
    .filter((row) => Object.values(row).some((value) => String(value).trim().length > 0));
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
    if (this.provider === ConnectorProvider.GOOGLE_SHEETS) {
      return googleSheetsCsvUrl(this.credentials);
    }

    const url = new URL(
      appendPath(
        providerBaseUrl(this.provider, this.credentials),
        providerOrdersPath(this.provider, this.credentials),
      ),
    );

    if (range) {
      url.searchParams.set("created_at_min", range.since);
      url.searchParams.set("created_at_max", range.until);
      url.searchParams.set("updated_at_min", range.since);
      url.searchParams.set("limit", "200");
    } else {
      url.searchParams.set("limit", "1");
    }
    appendProviderQueryParams(this.provider, url, this.credentials);

    return url;
  }

  async healthCheck() {
    const response = await callWithRetry(() =>
      this.fetchImpl(this.ordersUrl(), {
        headers: buildHeaders(this.provider, this.credentials),
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
        headers: buildHeaders(this.provider, this.credentials),
      }),
    );

    if (!response.ok) {
      throw new Error(`${this.provider} orders failed with status ${response.status}`);
    }

    if (this.provider === ConnectorProvider.GOOGLE_SHEETS) {
      return extractGoogleSheetPayloads(await response.text());
    }

    return extractOrderPayloads(await response.json());
  }
}
