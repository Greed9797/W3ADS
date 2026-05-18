import {
  ConnectorProvider,
  type ConnectorProviderConfig,
  type ConnectorProviderConfigStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  getSecretStore,
  serializeSecretRefs,
  type SecretRefMap,
  type SecretStore,
} from "@/lib/security/secret-store";

import type { GoogleAdsConfig } from "./google-ads/oauth";
import type { MetaConfig } from "./meta/oauth";
import type { NuvemshopConfig } from "./nuvemshop/oauth";
import { getConnectorDefinition, isManualCommerceProvider } from "./registry";
import type { ShopifyConfig } from "./shopify/oauth";

export type ProviderConfigPublicCredentials = Record<string, string | null | undefined>;
export type ProviderConfigSecrets = Record<string, string | null | undefined>;

export type ProviderConfigLike = {
  id?: string;
  workspaceId?: string;
  provider: ConnectorProvider;
  status?: ConnectorProviderConfigStatus | "ACTIVE" | "INACTIVE" | "ERROR";
  redirectUri?: string | null;
  scopes?: string | null;
  apiVersion?: string | null;
  baseUrl?: string | null;
  ordersPath?: string | null;
  displayName?: string | null;
  publicCredentials?: ProviderConfigPublicCredentials | null;
  secretRefs?: SecretRefMap | null;
  lastValidatedAt?: Date | null;
  lastValidationError?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
};

export type ProviderConfigInput = {
  provider: ConnectorProvider;
  status?: ConnectorProviderConfigStatus | "ACTIVE" | "INACTIVE" | "ERROR";
  redirectUri?: string | null;
  scopes?: string | null;
  apiVersion?: string | null;
  baseUrl?: string | null;
  ordersPath?: string | null;
  displayName?: string | null;
  publicCredentials?: ProviderConfigPublicCredentials;
  secrets?: ProviderConfigSecrets;
  existingSecretRefs?: SecretRefMap;
};

export type PublicProviderConfig = {
  id: string;
  workspaceId: string;
  provider: ConnectorProvider;
  providerName: string;
  status: string;
  redirectUri: string | null;
  scopes: string | null;
  apiVersion: string | null;
  baseUrl: string | null;
  ordersPath: string | null;
  displayName: string | null;
  publicCredentials: ProviderConfigPublicCredentials;
  configuredSecretKeys: string[];
  lastValidatedAt: Date | null;
  lastValidationError: string | null;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function stringRecord(value: unknown): ProviderConfigPublicCredentials {
  return Object.fromEntries(
    Object.entries(jsonRecord(value)).filter((entry): entry is [string, string] => {
      const [, item] = entry;

      return typeof item === "string";
    }),
  );
}

export function parseSecretRefs(value: unknown): SecretRefMap {
  return Object.fromEntries(
    Object.entries(jsonRecord(value)).filter((entry): entry is [string, string] => {
      const [, item] = entry;

      return typeof item === "string" && item.length > 0;
    }),
  );
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function providerName(provider: ConnectorProvider) {
  return getConnectorDefinition(provider).name;
}

function requiredPublicKey(config: ProviderConfigLike, key: string) {
  const value = config.publicCredentials?.[key];
  if (typeof value !== "string" || !hasText(value)) {
    throw new Error(`Configuração ${providerName(config.provider)} sem ${key}.`);
  }

  return value.trim();
}

async function requiredSecret(config: ProviderConfigLike, store: SecretStore, key: string) {
  const ref = config.secretRefs?.[key];
  if (!ref) {
    throw new Error(`Configuração ${providerName(config.provider)} sem segredo ${key}.`);
  }

  return store.getSecret(ref);
}

function requiredConfigText(config: ProviderConfigLike, key: keyof ProviderConfigLike) {
  const value = config[key];
  if (typeof value !== "string" || !hasText(value)) {
    throw new Error(`Configuração ${providerName(config.provider)} sem ${String(key)}.`);
  }

  return value.trim();
}

export function publicProviderConfig(config: ProviderConfigLike): PublicProviderConfig {
  return {
    id: config.id ?? "",
    workspaceId: config.workspaceId ?? "",
    provider: config.provider,
    providerName: providerName(config.provider),
    status: config.status ?? "ACTIVE",
    redirectUri: config.redirectUri ?? null,
    scopes: config.scopes ?? null,
    apiVersion: config.apiVersion ?? null,
    baseUrl: config.baseUrl ?? null,
    ordersPath: config.ordersPath ?? null,
    displayName: config.displayName ?? null,
    publicCredentials: stringRecord(config.publicCredentials),
    configuredSecretKeys: Object.keys(config.secretRefs ?? {}).sort(),
    lastValidatedAt: config.lastValidatedAt ?? null,
    lastValidationError: config.lastValidationError ?? null,
  };
}

export function validateProviderConfigInput(input: ProviderConfigInput) {
  const status = input.status ?? "ACTIVE";
  const existingRefs = input.existingSecretRefs ?? {};
  const publicCredentials = input.publicCredentials ?? {};
  const secrets = input.secrets ?? {};
  const hasSecret = (key: string) => hasText(secrets[key]) || hasText(existingRefs[key]);
  const hasPublic = (key: string) => hasText(publicCredentials[key]);

  if (status !== "ACTIVE") {
    return { success: true as const };
  }

  if (input.provider === ConnectorProvider.META_ADS) {
    if (!hasPublic("appId")) return { success: false as const, error: "Informe o App ID da Meta." };
    if (!hasSecret("appSecret")) {
      return { success: false as const, error: "Informe o app secret da Meta." };
    }
  }

  if (input.provider === ConnectorProvider.GOOGLE_ADS) {
    if (!hasPublic("clientId")) {
      return { success: false as const, error: "Informe o client ID do Google Ads." };
    }
    if (!hasSecret("clientSecret")) {
      return { success: false as const, error: "Informe o client secret do Google Ads." };
    }
    if (!hasSecret("developerToken")) {
      return { success: false as const, error: "Informe o developer token do Google Ads." };
    }
  }

  if (input.provider === ConnectorProvider.SHOPIFY) {
    if (!hasPublic("apiKey")) {
      return { success: false as const, error: "Informe a API key da Shopify." };
    }
    if (!hasSecret("apiSecret")) {
      return { success: false as const, error: "Informe o API secret da Shopify." };
    }
  }

  if (input.provider === ConnectorProvider.NUVEMSHOP) {
    if (!hasPublic("clientId")) {
      return { success: false as const, error: "Informe o client ID da Nuvemshop." };
    }
    if (!hasSecret("clientSecret")) {
      return { success: false as const, error: "Informe o client secret da Nuvemshop." };
    }
  }

  if (isManualCommerceProvider(input.provider)) {
    if (input.provider !== ConnectorProvider.WBUY && !hasText(input.baseUrl)) {
      return { success: false as const, error: "Informe a URL da API da loja." };
    }
    if (
      !hasSecret("apiKey") &&
      !hasSecret("apiSecret") &&
      !hasSecret("apiUser") &&
      !hasSecret("apiPassword")
    ) {
      return { success: false as const, error: "Informe pelo menos uma credencial da API." };
    }
  }

  return { success: true as const };
}

function cleanPublicCredentials(credentials: ProviderConfigPublicCredentials | undefined) {
  return Object.fromEntries(
    Object.entries(credentials ?? {})
      .map(([key, value]) => [key, value?.trim() ?? ""] as const)
      .filter(([, value]) => value.length > 0),
  );
}

async function saveSecrets(input: {
  provider: ConnectorProvider;
  workspaceId: string;
  secrets: ProviderConfigSecrets;
  existingRefs: SecretRefMap;
  store: SecretStore;
}) {
  const refs: SecretRefMap = { ...input.existingRefs };

  for (const [key, rawValue] of Object.entries(input.secrets)) {
    const value = rawValue?.trim();
    if (!value) {
      continue;
    }

    const name = `w3ads:${input.workspaceId}:${input.provider}:${key}`;
    if (refs[key]) {
      await input.store.updateSecret(refs[key], { name, value });
    } else {
      refs[key] = await input.store.createSecret({ name, value });
    }
  }

  return refs;
}

export async function upsertConnectorProviderConfig(input: {
  workspaceId: string;
  actorUserId: string;
  config: ProviderConfigInput;
  store?: SecretStore;
}) {
  const existing = await prisma.connectorProviderConfig.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: input.config.provider,
      },
    },
  });
  const existingRefs = parseSecretRefs(existing?.secretRefs);
  const validation = validateProviderConfigInput({
    ...input.config,
    existingSecretRefs: existingRefs,
  });

  if (!validation.success) {
    throw new Error(validation.error);
  }

  const store = input.store ?? getSecretStore();
  const secretRefs = await saveSecrets({
    provider: input.config.provider,
    workspaceId: input.workspaceId,
    secrets: input.config.secrets ?? {},
    existingRefs,
    store,
  });
  const publicCredentials = cleanPublicCredentials(input.config.publicCredentials);
  const status = input.config.status ?? "ACTIVE";

  return prisma.connectorProviderConfig.upsert({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: input.config.provider,
      },
    },
    update: {
      status,
      redirectUri: input.config.redirectUri?.trim() || null,
      scopes: input.config.scopes?.trim() || null,
      apiVersion: input.config.apiVersion?.trim() || null,
      baseUrl: input.config.baseUrl?.trim() || null,
      ordersPath: input.config.ordersPath?.trim() || null,
      displayName: input.config.displayName?.trim() || null,
      publicCredentials,
      secretRefs,
      lastValidationError: null,
    },
    create: {
      workspaceId: input.workspaceId,
      provider: input.config.provider,
      status,
      redirectUri: input.config.redirectUri?.trim() || null,
      scopes: input.config.scopes?.trim() || null,
      apiVersion: input.config.apiVersion?.trim() || null,
      baseUrl: input.config.baseUrl?.trim() || null,
      ordersPath: input.config.ordersPath?.trim() || null,
      displayName: input.config.displayName?.trim() || null,
      publicCredentials,
      secretRefs,
    },
  });
}

function normalizeConfig(config: ConnectorProviderConfig): ProviderConfigLike {
  return {
    ...config,
    publicCredentials: stringRecord(config.publicCredentials),
    secretRefs: parseSecretRefs(config.secretRefs),
  };
}

export async function getProviderConfig(input: {
  workspaceId: string;
  provider: ConnectorProvider;
}) {
  const config = await prisma.connectorProviderConfig.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: input.workspaceId,
        provider: input.provider,
      },
    },
  });

  return config ? normalizeConfig(config) : null;
}

export async function getActiveProviderConfig(input: {
  workspaceId: string;
  provider: ConnectorProvider;
}) {
  const config = await getProviderConfig(input);

  return config?.status === "ACTIVE" ? config : null;
}

export async function listPublicProviderConfigs(workspaceId: string) {
  const configs = await prisma.connectorProviderConfig.findMany({
    where: { workspaceId },
    orderBy: [{ provider: "asc" }],
  });

  return configs.map((config) => publicProviderConfig(normalizeConfig(config)));
}

export async function buildMetaConfigFromProviderConfig(
  config: ProviderConfigLike,
  store: SecretStore = getSecretStore(),
): Promise<MetaConfig> {
  return {
    appId: requiredPublicKey(config, "appId"),
    appSecret: await requiredSecret(config, store, "appSecret"),
    redirectUri: requiredConfigText(config, "redirectUri"),
    apiVersion: config.apiVersion?.trim() || "v25.0",
  };
}

export async function buildGoogleAdsConfigFromProviderConfig(
  config: ProviderConfigLike,
  store: SecretStore = getSecretStore(),
): Promise<GoogleAdsConfig> {
  return {
    clientId: requiredPublicKey(config, "clientId"),
    clientSecret: await requiredSecret(config, store, "clientSecret"),
    developerToken: await requiredSecret(config, store, "developerToken"),
    redirectUri: requiredConfigText(config, "redirectUri"),
    apiVersion: config.apiVersion?.trim() || "v24",
    loginCustomerId: config.publicCredentials?.loginCustomerId ?? undefined,
  };
}

export async function buildShopifyConfigFromProviderConfig(
  config: ProviderConfigLike,
  store: SecretStore = getSecretStore(),
): Promise<ShopifyConfig> {
  return {
    apiKey: requiredPublicKey(config, "apiKey"),
    apiSecret: await requiredSecret(config, store, "apiSecret"),
    redirectUri: requiredConfigText(config, "redirectUri"),
    scopes: config.scopes?.trim() || "read_orders,read_products,read_customers,read_analytics",
    apiVersion: config.apiVersion?.trim() || "2026-04",
  };
}

export async function buildNuvemshopConfigFromProviderConfig(
  config: ProviderConfigLike,
  store: SecretStore = getSecretStore(),
): Promise<NuvemshopConfig> {
  return {
    clientId: requiredPublicKey(config, "clientId"),
    clientSecret: await requiredSecret(config, store, "clientSecret"),
    redirectUri: requiredConfigText(config, "redirectUri"),
    apiBaseUrl: config.baseUrl?.trim() || "https://api.tiendanube.com/v1",
  };
}

export async function publicManualCredentialsFromProviderConfig(
  config: ProviderConfigLike,
  store: SecretStore = getSecretStore(),
) {
  const secretRefs = parseSecretRefs(config.secretRefs);
  const credentials: Record<string, string> = {};

  for (const key of ["apiKey", "apiSecret", "apiUser", "apiPassword"]) {
    if (secretRefs[key]) {
      credentials[key] = await store.getSecret(secretRefs[key]);
    }
  }

  return {
    ...credentials,
    baseUrl:
      config.provider === ConnectorProvider.WBUY && !config.baseUrl?.trim()
        ? "https://sistema.sistemawbuy.com.br/api/v1"
        : requiredConfigText(config, "baseUrl"),
    ordersPath:
      config.ordersPath?.trim() ||
      (config.provider === ConnectorProvider.WBUY
        ? "/order"
        : config.provider === ConnectorProvider.ISET ||
            config.provider === ConnectorProvider.MAGAZORD
          ? "/pedidos"
          : "/orders"),
  };
}

export function providerConfigToJson(config: ProviderConfigInput) {
  return {
    provider: config.provider,
    status: config.status ?? "ACTIVE",
    redirectUri: config.redirectUri ?? null,
    scopes: config.scopes ?? null,
    apiVersion: config.apiVersion ?? null,
    baseUrl: config.baseUrl ?? null,
    ordersPath: config.ordersPath ?? null,
    displayName: config.displayName ?? null,
    publicCredentials: cleanPublicCredentials(config.publicCredentials),
    secretRefs: serializeSecretRefs(config.existingSecretRefs ?? {}),
  } satisfies Prisma.InputJsonObject;
}
