import { ConnectorProvider } from "@prisma/client";

export type ConnectorConnectionMode = "oauth" | "manual";
export type ConnectorCategory = "ads" | "commerce";

export type ConnectorProviderDefinition = {
  provider: ConnectorProvider;
  name: string;
  category: ConnectorCategory;
  connectionMode: ConnectorConnectionMode;
  accountUnitLabel: string;
  supportsSelection: boolean;
  supportsOrders: boolean;
  supportsAdMetrics: boolean;
};

export const CONNECTOR_PROVIDER_DEFINITIONS: Partial<
  Record<ConnectorProvider, ConnectorProviderDefinition>
> = {
  [ConnectorProvider.META_ADS]: {
    provider: ConnectorProvider.META_ADS,
    name: "Meta Ads",
    category: "ads",
    connectionMode: "oauth",
    accountUnitLabel: "Conta de anuncio",
    supportsSelection: true,
    supportsOrders: false,
    supportsAdMetrics: true,
  },
  [ConnectorProvider.GOOGLE_ADS]: {
    provider: ConnectorProvider.GOOGLE_ADS,
    name: "Google Ads",
    category: "ads",
    connectionMode: "oauth",
    accountUnitLabel: "Conta de cliente",
    supportsSelection: true,
    supportsOrders: false,
    supportsAdMetrics: true,
  },
  [ConnectorProvider.SHOPIFY]: {
    provider: ConnectorProvider.SHOPIFY,
    name: "Shopify",
    category: "commerce",
    connectionMode: "oauth",
    accountUnitLabel: "Loja",
    supportsSelection: false,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
  [ConnectorProvider.NUVEMSHOP]: {
    provider: ConnectorProvider.NUVEMSHOP,
    name: "Nuvemshop",
    category: "commerce",
    connectionMode: "oauth",
    accountUnitLabel: "Loja",
    supportsSelection: true,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
  [ConnectorProvider.ISET]: {
    provider: ConnectorProvider.ISET,
    name: "iSet",
    category: "commerce",
    connectionMode: "manual",
    accountUnitLabel: "Loja",
    supportsSelection: false,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
  [ConnectorProvider.TRAY]: {
    provider: ConnectorProvider.TRAY,
    name: "Tray",
    category: "commerce",
    connectionMode: "manual",
    accountUnitLabel: "Loja",
    supportsSelection: false,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
  [ConnectorProvider.WBUY]: {
    provider: ConnectorProvider.WBUY,
    name: "WBuy",
    category: "commerce",
    connectionMode: "manual",
    accountUnitLabel: "Loja",
    supportsSelection: false,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
  [ConnectorProvider.MAGAZORD]: {
    provider: ConnectorProvider.MAGAZORD,
    name: "Magazord",
    category: "commerce",
    connectionMode: "manual",
    accountUnitLabel: "Loja",
    supportsSelection: false,
    supportsOrders: true,
    supportsAdMetrics: false,
  },
};

export const selectableAdsProviders = [
  ConnectorProvider.META_ADS,
  ConnectorProvider.GOOGLE_ADS,
] as const;

export const oauthCommerceProviders = [
  ConnectorProvider.SHOPIFY,
  ConnectorProvider.NUVEMSHOP,
] as const;

export const manualCommerceProviders = [
  ConnectorProvider.ISET,
  ConnectorProvider.TRAY,
  ConnectorProvider.WBUY,
  ConnectorProvider.MAGAZORD,
] as const;

export function getConnectorDefinition(provider: ConnectorProvider) {
  const definition = CONNECTOR_PROVIDER_DEFINITIONS[provider];

  if (!definition) {
    throw new Error(`Unsupported connector provider: ${provider}`);
  }

  return definition;
}

export function isManualCommerceProvider(provider: ConnectorProvider) {
  return manualCommerceProviders.includes(
    provider as (typeof manualCommerceProviders)[number],
  );
}

export function isOAuthCommerceProvider(provider: ConnectorProvider) {
  return oauthCommerceProviders.includes(
    provider as (typeof oauthCommerceProviders)[number],
  );
}
