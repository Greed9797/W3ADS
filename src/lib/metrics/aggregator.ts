import Decimal from "decimal.js";
import { ConnectorProvider, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import {
  dashboardCommerceProviders,
  dashboardTrafficProviders,
  listDateKeys,
  toDateKey,
  type DashboardPeriod,
} from "./period";

type NumericLike = Decimal.Value | null | undefined;

export type DashboardOrderRow = {
  connectorAccountId: string;
  platform: ConnectorProvider;
  orderTotal: NumericLike;
  itemsCount?: number | null;
  status?: string | null;
  shippingState?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  placedAt: Date;
};

export type DashboardOrderItemRow = {
  productName: string;
  quantity: number;
  total: NumericLike;
  placedAt: Date;
};

export type DashboardMetricRow = {
  connectorAccountId: string;
  source: ConnectorProvider;
  date: Date;
  campaignId: string | null;
  campaignName: string | null;
  spend: NumericLike;
  impressions: bigint | number | null;
  clicks: bigint | number | null;
  sessions: bigint | number | null;
  conversions: NumericLike;
  conversionsValue: NumericLike;
};

export type DashboardConnectorRow = {
  id: string;
  provider: ConnectorProvider;
  accountName: string;
};

type DashboardSnapshotQueryInput = {
  workspaceId: string;
  period: DashboardPeriod;
  trafficProviders: ConnectorProvider[];
  commerceProviders: ConnectorProvider[];
};

export type DashboardKpi = {
  value: number;
  previousValue: number;
  deltaPercent: number;
};

export type DashboardSnapshot = {
  hasData: boolean;
  kpis: {
    revenue: DashboardKpi;
    spend: DashboardKpi;
    roas: DashboardKpi;
    approvedOrders: DashboardKpi;
    orders: DashboardKpi;
    averageOrderValue: DashboardKpi;
    mediaRate: DashboardKpi;
    conversionRate: DashboardKpi;
    costPerSession: DashboardKpi;
    sessions: DashboardKpi;
  };
  lineSeries: Array<{
    date: string;
    label: string;
    revenue: number;
    spend: number;
    orders: number;
    averageOrderValue: number;
    mediaRate: number;
    previousMediaRate: number;
    conversionRate: number;
    costPerSession: number;
    roas: number;
    metaRoas: number;
    googleRoas: number;
    previousRevenue: number;
    previousSpend: number;
    previousOrders: number;
    previousAverageOrderValue: number;
  }>;
  platformRoas: {
    meta: DashboardKpi;
    google: DashboardKpi;
  };
  topCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    source: ConnectorProvider;
    spend: number;
    conversionsValue: number;
    roas: number;
  }>;
  funnel: {
    impressions: number;
    clicks: number;
    sessions: number;
    addToCart: number;
    checkouts: number;
    purchases: number;
    orders: number;
    stages: Array<{
      id: "sessions" | "add_to_cart" | "checkouts" | "purchases" | "orders";
      label: string;
      value: number;
      available: boolean;
      percentOfFirstStage: number;
    }>;
  };
  stateSales: Array<DashboardBreakdownItem>;
  stateOrders: Array<DashboardBreakdownItem>;
  originMedia: Array<DashboardBreakdownItem>;
  products: Array<DashboardProductRow>;
  connectorRanking: Array<DashboardConnectorRankingRow>;
};

export type DashboardBreakdownItem = {
  label: string;
  value: number;
  percent: number;
};

export type DashboardProductRow = {
  productName: string;
  quantitySold: number;
  revenue: number;
  status: "available" | "missing_data";
};

export type DashboardConnectorRankingRow = {
  connectorAccountId: string;
  accountName: string;
  provider: ConnectorProvider;
  revenue: number;
  spend: number;
  orders: number;
  roas: number;
  mediaRate: number;
};

function asNumber(value: NumericLike) {
  if (value === null || value === undefined) {
    return 0;
  }

  return new Decimal(value).toNumber();
}

function asInteger(value: bigint | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return Number(value);
}

function isWithin(date: Date, from: Date, to: Date) {
  const key = toDateKey(date);
  return key >= toDateKey(from) && key <= toDateKey(to);
}

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

function isMissingDashboardSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

export function calculateRoas(revenue: number, spend: number) {
  if (spend <= 0) {
    return 0;
  }

  return round(revenue / spend);
}

export function calculateRatioPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return round((numerator / denominator) * 100);
}

export function calculateDeltaPercent(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

function kpi(current: number, previous: number): DashboardKpi {
  return {
    value: round(current),
    previousValue: round(previous),
    deltaPercent: calculateDeltaPercent(current, previous),
  };
}

export function isApprovedOrderStatus(status: string | null | undefined) {
  const normalized = (status ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const rejectedTerms = [
    "cancel",
    "cancelado",
    "refund",
    "reembolsado",
    "void",
    "failed",
    "falhou",
    "recusado",
    "unpaid",
    "pending",
    "pendente",
    "aguardando",
    "aberto",
  ];

  return !rejectedTerms.some((term) => normalized.includes(term));
}

function applyPercent(items: Array<Omit<DashboardBreakdownItem, "percent">>) {
  const total = items.reduce((sum, item) => sum + item.value, 0);

  return items
    .map((item) => ({
      ...item,
      value: round(item.value),
      percent: total > 0 ? round((item.value / total) * 100, 1) : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function originLabel(order: DashboardOrderRow) {
  const source = order.utmSource?.trim();
  const medium = order.utmMedium?.trim();

  if (source && medium) {
    return `${source} / ${medium}`;
  }

  if (source) {
    return source;
  }

  if (medium) {
    return medium;
  }

  return "Sem UTM";
}

function emptyFunnelStage(
  id: DashboardSnapshot["funnel"]["stages"][number]["id"],
  label: string,
): DashboardSnapshot["funnel"]["stages"][number] {
  return {
    id,
    label,
    value: 0,
    available: false,
    percentOfFirstStage: 0,
  };
}

function buildFunnelStages(input: {
  sessions: number;
  addToCart: number;
  checkouts: number;
  purchases: number;
  orders: number;
}) {
  const first = input.sessions;
  const stage = (
    id: DashboardSnapshot["funnel"]["stages"][number]["id"],
    label: string,
    value: number,
    available: boolean,
  ) => ({
    id,
    label,
    value,
    available,
    percentOfFirstStage: first > 0 ? round((value / first) * 100, 1) : 0,
  });

  return [
    stage("sessions", "Sessões", input.sessions, input.sessions > 0),
    emptyFunnelStage("add_to_cart", "Adições ao carrinho"),
    emptyFunnelStage("checkouts", "Checkouts"),
    stage("purchases", "Compras", input.purchases, input.purchases > 0),
    stage("orders", "Pedidos", input.orders, input.orders > 0),
  ];
}

export function buildDashboardSnapshot(input: {
  period: DashboardPeriod;
  orders: DashboardOrderRow[];
  orderItems?: DashboardOrderItemRow[];
  metrics: DashboardMetricRow[];
  connectorAccounts?: DashboardConnectorRow[];
  trafficProviders?: ConnectorProvider[];
  commerceProviders?: ConnectorProvider[];
}): DashboardSnapshot {
  const { period } = input;
  const trafficProviders = input.trafficProviders ?? [...dashboardTrafficProviders];
  const commerceProviders = input.commerceProviders ?? [...dashboardCommerceProviders];
  const connectorNames = new Map(
    (input.connectorAccounts ?? []).map((account) => [account.id, account] as const),
  );
  const filteredOrders = input.orders.filter((order) =>
    commerceProviders.includes(order.platform),
  );
  const filteredMetrics = input.metrics.filter((metric) =>
    trafficProviders.includes(metric.source),
  );
  const filteredOrderItems = (input.orderItems ?? []).filter((item) =>
    isWithin(item.placedAt, period.from, period.to),
  );
  const currentOrders = filteredOrders.filter((order) => isWithin(order.placedAt, period.from, period.to));
  const previousOrders = input.orders.filter((order) =>
    commerceProviders.includes(order.platform) &&
    isWithin(order.placedAt, period.comparison.from, period.comparison.to),
  );
  const currentMetrics = filteredMetrics.filter((metric) => isWithin(metric.date, period.from, period.to));
  const previousMetrics = input.metrics.filter((metric) =>
    trafficProviders.includes(metric.source) &&
    isWithin(metric.date, period.comparison.from, period.comparison.to),
  );

  const revenue = currentOrders.reduce((sum, order) => sum + asNumber(order.orderTotal), 0);
  const previousRevenue = previousOrders.reduce((sum, order) => sum + asNumber(order.orderTotal), 0);
  const spend = currentMetrics.reduce((sum, metric) => sum + asNumber(metric.spend), 0);
  const previousSpend = previousMetrics.reduce((sum, metric) => sum + asNumber(metric.spend), 0);
  const impressions = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.impressions), 0);
  const clicks = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.clicks), 0);
  const sessions = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.sessions), 0);
  const previousSessions = previousMetrics.reduce((sum, metric) => sum + asInteger(metric.sessions), 0);
  const roas = calculateRoas(revenue, spend);
  const previousRoas = calculateRoas(previousRevenue, previousSpend);
  const orders = currentOrders.length;
  const previousOrderCount = previousOrders.length;
  const approvedOrders = currentOrders.filter((order) =>
    isApprovedOrderStatus((order as { status?: string | null }).status),
  ).length;
  const previousApprovedOrders = previousOrders.filter((order) =>
    isApprovedOrderStatus((order as { status?: string | null }).status),
  ).length;
  const averageOrderValue = orders > 0 ? revenue / orders : 0;
  const previousAverageOrderValue = previousOrderCount > 0 ? previousRevenue / previousOrderCount : 0;
  const mediaRate = calculateRatioPercent(spend, revenue);
  const previousMediaRate = calculateRatioPercent(previousSpend, previousRevenue);
  const conversionRate = calculateRatioPercent(orders, sessions);
  const previousConversionRate = calculateRatioPercent(previousOrderCount, previousSessions);
  const costPerSession = sessions > 0 ? spend / sessions : 0;
  const previousCostPerSession = previousSessions > 0 ? previousSpend / previousSessions : 0;
  const daily = new Map(
    listDateKeys(period.from, period.to).map((date) => [
      date,
      {
        date,
        label: date.slice(5).replace("-", "/"),
        revenue: 0,
        spend: 0,
        orders: 0,
        approvedOrders: 0,
        averageOrderValue: 0,
        sessions: 0,
        mediaRate: 0,
        previousMediaRate: 0,
        conversionRate: 0,
        costPerSession: 0,
        roas: 0,
        metaSpend: 0,
        metaConversionsValue: 0,
        metaRoas: 0,
        googleSpend: 0,
        googleConversionsValue: 0,
        googleRoas: 0,
        previousRevenue: 0,
        previousSpend: 0,
        previousOrders: 0,
        previousApprovedOrders: 0,
        previousAverageOrderValue: 0,
      },
    ]),
  );

  for (const order of currentOrders) {
    const item = daily.get(toDateKey(order.placedAt));
    if (item) {
      item.revenue += asNumber(order.orderTotal);
      item.orders += 1;
      if (isApprovedOrderStatus((order as { status?: string | null }).status)) {
        item.approvedOrders += 1;
      }
    }
  }

  for (const metric of currentMetrics) {
    const item = daily.get(toDateKey(metric.date));
    if (item) {
      item.spend += asNumber(metric.spend);
      item.sessions += asInteger(metric.sessions);
      if (metric.source === ConnectorProvider.META_ADS) {
        item.metaSpend += asNumber(metric.spend);
        item.metaConversionsValue += asNumber(metric.conversionsValue);
      }
      if (metric.source === ConnectorProvider.GOOGLE_ADS) {
        item.googleSpend += asNumber(metric.spend);
        item.googleConversionsValue += asNumber(metric.conversionsValue);
      }
    }
  }

  const currentDateKeys = listDateKeys(period.from, period.to);
  const previousDateKeys = listDateKeys(period.comparison.from, period.comparison.to);
  const alignedDates = currentDateKeys.map((date, index) => ({
    current: date,
    previous: previousDateKeys[index],
  }));
  const alignedByPreviousDate = new Map(
    alignedDates
      .filter((item): item is { current: string; previous: string } => Boolean(item.previous))
      .map((item) => [item.previous, item.current] as const),
  );

  for (const order of previousOrders) {
    const currentKey = alignedByPreviousDate.get(toDateKey(order.placedAt));
    const item = currentKey ? daily.get(currentKey) : null;
    if (item) {
      item.previousRevenue += asNumber(order.orderTotal);
      item.previousOrders += 1;
      if (isApprovedOrderStatus((order as { status?: string | null }).status)) {
        item.previousApprovedOrders += 1;
      }
    }
  }

  for (const metric of previousMetrics) {
    const currentKey = alignedByPreviousDate.get(toDateKey(metric.date));
    const item = currentKey ? daily.get(currentKey) : null;
    if (item) {
      item.previousSpend += asNumber(metric.spend);
    }
  }

  const campaigns = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      source: ConnectorProvider;
      spend: number;
      conversionsValue: number;
    }
  >();
  const providerPerformance = new Map<
    ConnectorProvider,
    {
      spend: number;
      conversionsValue: number;
      previousSpend: number;
      previousConversionsValue: number;
    }
  >();

  for (const metric of currentMetrics) {
    const campaignId = metric.campaignId ?? "sem-campanha";
    const campaignKey = `${metric.source}:${campaignId}`;
    const existing = campaigns.get(campaignKey) ?? {
      campaignId,
      campaignName: metric.campaignName ?? "Sem campanha",
      source: metric.source,
      spend: 0,
      conversionsValue: 0,
    };

    existing.spend += asNumber(metric.spend);
    existing.conversionsValue += asNumber(metric.conversionsValue);
    campaigns.set(campaignKey, existing);

    const provider = providerPerformance.get(metric.source) ?? {
      spend: 0,
      conversionsValue: 0,
      previousSpend: 0,
      previousConversionsValue: 0,
    };
    provider.spend += asNumber(metric.spend);
    provider.conversionsValue += asNumber(metric.conversionsValue);
    providerPerformance.set(metric.source, provider);
  }

  for (const metric of previousMetrics) {
    const provider = providerPerformance.get(metric.source) ?? {
      spend: 0,
      conversionsValue: 0,
      previousSpend: 0,
      previousConversionsValue: 0,
    };
    provider.previousSpend += asNumber(metric.spend);
    provider.previousConversionsValue += asNumber(metric.conversionsValue);
    providerPerformance.set(metric.source, provider);
  }

  const purchases = currentMetrics.reduce((sum, metric) => sum + asNumber(metric.conversions), 0);
  const originRevenue = new Map<string, number>();
  const stateRevenue = new Map<string, number>();
  const stateOrderCounts = new Map<string, number>();
  const productRevenue = new Map<
    string,
    {
      productName: string;
      quantitySold: number;
      revenue: number;
    }
  >();
  const connectorRanking = new Map<
    string,
    {
      connectorAccountId: string;
      accountName: string;
      provider: ConnectorProvider;
      revenue: number;
      spend: number;
      orders: number;
    }
  >();

  for (const order of currentOrders) {
    originRevenue.set(originLabel(order), (originRevenue.get(originLabel(order)) ?? 0) + asNumber(order.orderTotal));
    const shippingState = order.shippingState?.trim();
    if (shippingState) {
      stateRevenue.set(
        shippingState,
        (stateRevenue.get(shippingState) ?? 0) + asNumber(order.orderTotal),
      );
      stateOrderCounts.set(shippingState, (stateOrderCounts.get(shippingState) ?? 0) + 1);
    }
    const account = connectorNames.get(order.connectorAccountId);
    const existing = connectorRanking.get(order.connectorAccountId) ?? {
      connectorAccountId: order.connectorAccountId,
      accountName: account?.accountName ?? "Loja sem nome",
      provider: account?.provider ?? order.platform,
      revenue: 0,
      spend: 0,
      orders: 0,
    };

    existing.revenue += asNumber(order.orderTotal);
    existing.orders += 1;
    connectorRanking.set(order.connectorAccountId, existing);
  }

  for (const metric of currentMetrics) {
    const account = connectorNames.get(metric.connectorAccountId);
    const existing = connectorRanking.get(metric.connectorAccountId) ?? {
      connectorAccountId: metric.connectorAccountId,
      accountName: account?.accountName ?? "Conta de mídia sem nome",
      provider: account?.provider ?? metric.source,
      revenue: 0,
      spend: 0,
      orders: 0,
    };

    existing.spend += asNumber(metric.spend);
    connectorRanking.set(metric.connectorAccountId, existing);
  }

  const originMedia = applyPercent(
    Array.from(originRevenue.entries()).map(([label, value]) => ({ label, value })).slice(0, 8),
  );
  const stateSales = applyPercent(
    Array.from(stateRevenue.entries()).map(([label, value]) => ({ label, value })).slice(0, 8),
  );
  const stateOrders = applyPercent(
    Array.from(stateOrderCounts.entries()).map(([label, value]) => ({ label, value })).slice(0, 8),
  );
  for (const item of filteredOrderItems) {
    const existing = productRevenue.get(item.productName) ?? {
      productName: item.productName,
      quantitySold: 0,
      revenue: 0,
    };
    existing.quantitySold += item.quantity;
    existing.revenue += asNumber(item.total);
    productRevenue.set(item.productName, existing);
  }
  const funnelStages = buildFunnelStages({
    sessions,
    addToCart: 0,
    checkouts: 0,
    purchases: round(purchases),
    orders,
  });

  return {
    hasData: currentOrders.length > 0 || currentMetrics.length > 0,
    kpis: {
      revenue: kpi(revenue, previousRevenue),
      spend: kpi(spend, previousSpend),
      roas: kpi(roas, previousRoas),
      approvedOrders: kpi(approvedOrders, previousApprovedOrders),
      orders: kpi(orders, previousOrderCount),
      averageOrderValue: kpi(averageOrderValue, previousAverageOrderValue),
      mediaRate: kpi(mediaRate, previousMediaRate),
      conversionRate: kpi(conversionRate, previousConversionRate),
      costPerSession: kpi(costPerSession, previousCostPerSession),
      sessions: kpi(sessions, previousSessions),
    },
    lineSeries: Array.from(daily.values()).map((item) => ({
      ...item,
      averageOrderValue: item.orders > 0 ? round(item.revenue / item.orders) : 0,
      mediaRate: calculateRatioPercent(item.spend, item.revenue),
      previousMediaRate: calculateRatioPercent(item.previousSpend, item.previousRevenue),
      conversionRate: calculateRatioPercent(item.orders, item.sessions),
      costPerSession: item.sessions > 0 ? round(item.spend / item.sessions) : 0,
      roas: calculateRoas(item.revenue, item.spend),
      metaRoas: calculateRoas(item.metaConversionsValue, item.metaSpend),
      googleRoas: calculateRoas(item.googleConversionsValue, item.googleSpend),
      previousAverageOrderValue:
        item.previousOrders > 0 ? round(item.previousRevenue / item.previousOrders) : 0,
      revenue: round(item.revenue),
      spend: round(item.spend),
      previousRevenue: round(item.previousRevenue),
      previousSpend: round(item.previousSpend),
    })),
    platformRoas: {
      meta: kpi(
        calculateRoas(
          providerPerformance.get(ConnectorProvider.META_ADS)?.conversionsValue ?? 0,
          providerPerformance.get(ConnectorProvider.META_ADS)?.spend ?? 0,
        ),
        calculateRoas(
          providerPerformance.get(ConnectorProvider.META_ADS)?.previousConversionsValue ?? 0,
          providerPerformance.get(ConnectorProvider.META_ADS)?.previousSpend ?? 0,
        ),
      ),
      google: kpi(
        calculateRoas(
          providerPerformance.get(ConnectorProvider.GOOGLE_ADS)?.conversionsValue ?? 0,
          providerPerformance.get(ConnectorProvider.GOOGLE_ADS)?.spend ?? 0,
        ),
        calculateRoas(
          providerPerformance.get(ConnectorProvider.GOOGLE_ADS)?.previousConversionsValue ?? 0,
          providerPerformance.get(ConnectorProvider.GOOGLE_ADS)?.previousSpend ?? 0,
        ),
      ),
    },
    topCampaigns: Array.from(campaigns.values())
      .map((campaign) => ({
        ...campaign,
        spend: round(campaign.spend),
        conversionsValue: round(campaign.conversionsValue),
        roas: calculateRoas(campaign.conversionsValue, campaign.spend),
      }))
      .filter((campaign) => campaign.spend > 0)
      .sort((a, b) => b.roas - a.roas)
      .slice(0, 10),
    funnel: {
      impressions,
      clicks,
      sessions,
      addToCart: 0,
      checkouts: 0,
      purchases: round(purchases),
      orders,
      stages: funnelStages,
    },
    stateSales,
    stateOrders,
    originMedia,
    products: Array.from(productRevenue.values())
      .map((product) => ({
        ...product,
        revenue: round(product.revenue),
        status: "available" as const,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    connectorRanking: Array.from(connectorRanking.values())
      .filter((row) => row.revenue > 0 || row.spend > 0 || row.orders > 0)
      .map((row) => ({
        ...row,
        revenue: round(row.revenue),
        spend: round(row.spend),
        roas: calculateRoas(row.revenue, row.spend),
        mediaRate: calculateRatioPercent(row.spend, row.revenue),
      }))
      .sort((a, b) => b.revenue + b.spend - (a.revenue + a.spend))
      .slice(0, 10),
  };
}

export async function getDashboardSnapshot(input: {
  workspaceId: string;
  period: DashboardPeriod;
  trafficProviders?: ConnectorProvider[];
  commerceProviders?: ConnectorProvider[];
}) {
  const trafficProviders = input.trafficProviders ?? [...dashboardTrafficProviders];
  const commerceProviders = input.commerceProviders ?? [...dashboardCommerceProviders];

  const queryInput = {
    workspaceId: input.workspaceId,
    period: input.period,
    trafficProviders,
    commerceProviders,
  };

  const [orders, orderItems, metrics, connectorAccounts] = await Promise.all([
    findDashboardOrders(queryInput),
    findDashboardOrderItems(queryInput),
    prisma.dailyMetric.findMany({
      where: {
        workspaceId: input.workspaceId,
        source: {
          in: trafficProviders,
        },
        date: {
          gte: input.period.comparison.from,
          lte: input.period.to,
        },
      },
      select: {
        connectorAccountId: true,
        source: true,
        date: true,
        campaignId: true,
        campaignName: true,
        spend: true,
        impressions: true,
        clicks: true,
        sessions: true,
        conversions: true,
        conversionsValue: true,
      },
    }),
    prisma.connectorAccount.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          {
            provider: {
              in: trafficProviders,
            },
          },
          {
            provider: {
              in: commerceProviders,
            },
          },
        ],
      },
      select: {
        id: true,
        provider: true,
        accountName: true,
      },
    }),
  ]);

  return buildDashboardSnapshot({
    period: input.period,
    orders,
    orderItems,
    metrics,
    connectorAccounts,
    trafficProviders,
    commerceProviders,
  });
}

async function findDashboardOrders(input: DashboardSnapshotQueryInput): Promise<DashboardOrderRow[]> {
  const where = {
    workspaceId: input.workspaceId,
    platform: {
      in: input.commerceProviders,
    },
    placedAt: {
      gte: input.period.comparison.from,
      lte: input.period.to,
    },
  };

  try {
    return await prisma.ecommerceOrder.findMany({
      where,
      select: {
        connectorAccountId: true,
        platform: true,
        orderTotal: true,
        itemsCount: true,
        status: true,
        shippingState: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        placedAt: true,
      },
    });
  } catch (error) {
    if (!isMissingDashboardSchemaError(error)) {
      throw error;
    }

    const legacyOrders = await prisma.ecommerceOrder.findMany({
      where,
      select: {
        connectorAccountId: true,
        platform: true,
        orderTotal: true,
        itemsCount: true,
        status: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        placedAt: true,
      },
    });

    return legacyOrders.map((order) => ({
      ...order,
      status: order.status,
      shippingState: null,
    }));
  }
}

async function findDashboardOrderItems(
  input: DashboardSnapshotQueryInput,
): Promise<DashboardOrderItemRow[]> {
  try {
    return await prisma.ecommerceOrderItem.findMany({
      where: {
        workspaceId: input.workspaceId,
        ecommerceOrder: {
          platform: {
            in: input.commerceProviders,
          },
        },
        placedAt: {
          gte: input.period.from,
          lte: input.period.to,
        },
      },
      select: {
        productName: true,
        quantity: true,
        total: true,
        placedAt: true,
      },
    });
  } catch (error) {
    if (isMissingDashboardSchemaError(error)) {
      return [];
    }

    throw error;
  }
}
