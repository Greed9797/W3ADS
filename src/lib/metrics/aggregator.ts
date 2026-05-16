import Decimal from "decimal.js";

import { prisma } from "@/lib/db/prisma";

import { listDateKeys, toDateKey, type DashboardPeriod } from "./period";

type NumericLike = Decimal.Value | null | undefined;

export type DashboardOrderRow = {
  orderTotal: NumericLike;
  placedAt: Date;
};

export type DashboardMetricRow = {
  date: Date;
  campaignId: string | null;
  campaignName: string | null;
  spend: NumericLike;
  impressions: bigint | number | null;
  clicks: bigint | number | null;
  sessions: bigint | number | null;
  conversionsValue: NumericLike;
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
    orders: DashboardKpi;
  };
  lineSeries: Array<{
    date: string;
    label: string;
    revenue: number;
    spend: number;
  }>;
  topCampaigns: Array<{
    campaignId: string;
    campaignName: string;
    spend: number;
    conversionsValue: number;
    roas: number;
  }>;
  funnel: {
    impressions: number;
    clicks: number;
    sessions: number;
    orders: number;
  };
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

export function calculateRoas(revenue: number, spend: number) {
  if (spend <= 0) {
    return 0;
  }

  return round(revenue / spend);
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

export function buildDashboardSnapshot(input: {
  period: DashboardPeriod;
  orders: DashboardOrderRow[];
  metrics: DashboardMetricRow[];
}): DashboardSnapshot {
  const { period } = input;
  const currentOrders = input.orders.filter((order) => isWithin(order.placedAt, period.from, period.to));
  const previousOrders = input.orders.filter((order) =>
    isWithin(order.placedAt, period.previousFrom, period.previousTo),
  );
  const currentMetrics = input.metrics.filter((metric) => isWithin(metric.date, period.from, period.to));
  const previousMetrics = input.metrics.filter((metric) =>
    isWithin(metric.date, period.previousFrom, period.previousTo),
  );

  const revenue = currentOrders.reduce((sum, order) => sum + asNumber(order.orderTotal), 0);
  const previousRevenue = previousOrders.reduce((sum, order) => sum + asNumber(order.orderTotal), 0);
  const spend = currentMetrics.reduce((sum, metric) => sum + asNumber(metric.spend), 0);
  const previousSpend = previousMetrics.reduce((sum, metric) => sum + asNumber(metric.spend), 0);
  const roas = calculateRoas(revenue, spend);
  const previousRoas = calculateRoas(previousRevenue, previousSpend);
  const orders = currentOrders.length;
  const previousOrderCount = previousOrders.length;
  const daily = new Map(
    listDateKeys(period.from, period.to).map((date) => [
      date,
      {
        date,
        label: date.slice(5).replace("-", "/"),
        revenue: 0,
        spend: 0,
      },
    ]),
  );

  for (const order of currentOrders) {
    const item = daily.get(toDateKey(order.placedAt));
    if (item) {
      item.revenue += asNumber(order.orderTotal);
    }
  }

  for (const metric of currentMetrics) {
    const item = daily.get(toDateKey(metric.date));
    if (item) {
      item.spend += asNumber(metric.spend);
    }
  }

  const campaigns = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      spend: number;
      conversionsValue: number;
    }
  >();

  for (const metric of currentMetrics) {
    const campaignId = metric.campaignId ?? "sem-campanha";
    const existing = campaigns.get(campaignId) ?? {
      campaignId,
      campaignName: metric.campaignName ?? "Sem campanha",
      spend: 0,
      conversionsValue: 0,
    };

    existing.spend += asNumber(metric.spend);
    existing.conversionsValue += asNumber(metric.conversionsValue);
    campaigns.set(campaignId, existing);
  }

  const impressions = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.impressions), 0);
  const clicks = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.clicks), 0);
  const sessions = currentMetrics.reduce((sum, metric) => sum + asInteger(metric.sessions), 0);

  return {
    hasData: currentOrders.length > 0 || currentMetrics.length > 0,
    kpis: {
      revenue: kpi(revenue, previousRevenue),
      spend: kpi(spend, previousSpend),
      roas: kpi(roas, previousRoas),
      orders: kpi(orders, previousOrderCount),
    },
    lineSeries: Array.from(daily.values()).map((item) => ({
      ...item,
      revenue: round(item.revenue),
      spend: round(item.spend),
    })),
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
      orders,
    },
  };
}

export async function getDashboardSnapshot(input: {
  workspaceId: string;
  period: DashboardPeriod;
}) {
  const [orders, metrics] = await Promise.all([
    prisma.ecommerceOrder.findMany({
      where: {
        workspaceId: input.workspaceId,
        placedAt: {
          gte: input.period.previousFrom,
          lte: input.period.to,
        },
      },
      select: {
        orderTotal: true,
        placedAt: true,
      },
    }),
    prisma.dailyMetric.findMany({
      where: {
        workspaceId: input.workspaceId,
        date: {
          gte: input.period.previousFrom,
          lte: input.period.to,
        },
      },
      select: {
        date: true,
        campaignId: true,
        campaignName: true,
        spend: true,
        impressions: true,
        clicks: true,
        sessions: true,
        conversionsValue: true,
      },
    }),
  ]);

  return buildDashboardSnapshot({
    period: input.period,
    orders,
    metrics,
  });
}
