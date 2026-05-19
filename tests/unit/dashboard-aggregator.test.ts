import { describe, expect, it } from "vitest";
import { ConnectorProvider } from "@prisma/client";

import {
  buildDashboardSnapshot,
  calculateDeltaPercent,
  calculateRatioPercent,
  calculateRoas,
} from "@/lib/metrics/aggregator";
import { getDashboardPeriod } from "@/lib/metrics/period";

describe("dashboard aggregator", () => {
  it("calculates ROAS and previous-period deltas", () => {
    expect(calculateRoas(1000, 250)).toBe(4);
    expect(calculateRoas(1000, 0)).toBe(0);
    expect(calculateRatioPercent(25, 100)).toBe(25);
    expect(calculateRatioPercent(25, 0)).toBe(0);
    expect(calculateDeltaPercent(150, 100)).toBe(50);
    expect(calculateDeltaPercent(0, 0)).toBe(0);
  });

  it("builds KPI totals, line series, funnel and top campaigns", () => {
    const period = getDashboardPeriod(
      { period: "7d" },
      new Date("2026-05-16T12:00:00.000Z"),
    );
    const snapshot = buildDashboardSnapshot({
      period,
      orders: [
        {
          connectorAccountId: "shopify-1",
          platform: ConnectorProvider.SHOPIFY,
          orderTotal: "200.00",
          itemsCount: 2,
          shippingState: "SP",
          utmSource: "google",
          utmMedium: "organic",
          placedAt: new Date("2026-05-10T10:00:00.000Z"),
        },
        {
          connectorAccountId: "nuvemshop-1",
          platform: ConnectorProvider.NUVEMSHOP,
          orderTotal: "300.00",
          itemsCount: 1,
          shippingState: "RJ",
          utmSource: "meta",
          utmMedium: "cpc",
          placedAt: new Date("2026-05-12T10:00:00.000Z"),
        },
        {
          connectorAccountId: "shopify-1",
          platform: ConnectorProvider.SHOPIFY,
          orderTotal: "100.00",
          itemsCount: 1,
          shippingState: "SP",
          utmSource: "google",
          utmMedium: "organic",
          placedAt: new Date("2026-05-04T10:00:00.000Z"),
        },
      ],
      metrics: [
        {
          date: new Date("2026-05-10T00:00:00.000Z"),
          connectorAccountId: "meta-1",
          source: ConnectorProvider.META_ADS,
          campaignId: "c1",
          campaignName: "Marca",
          spend: "100.00",
          impressions: BigInt(1000),
          clicks: BigInt(100),
          sessions: BigInt(80),
          conversions: "4",
          conversionsValue: "400.00",
        },
        {
          date: new Date("2026-05-12T00:00:00.000Z"),
          connectorAccountId: "google-1",
          source: ConnectorProvider.GOOGLE_ADS,
          campaignId: "c2",
          campaignName: "Performance Max",
          spend: "50.00",
          impressions: BigInt(500),
          clicks: BigInt(40),
          sessions: BigInt(30),
          conversions: "2",
          conversionsValue: "300.00",
        },
        {
          date: new Date("2026-05-04T00:00:00.000Z"),
          connectorAccountId: "meta-1",
          source: ConnectorProvider.META_ADS,
          campaignId: "old",
          campaignName: "Anterior",
          spend: "50.00",
          impressions: BigInt(200),
          clicks: BigInt(20),
          sessions: BigInt(12),
          conversions: "0",
          conversionsValue: "0.00",
        },
      ],
      orderItems: [
        {
          productName: "Produto A",
          quantity: 2,
          total: "200.00",
          placedAt: new Date("2026-05-10T10:00:00.000Z"),
        },
        {
          productName: "Produto B",
          quantity: 1,
          total: "300.00",
          placedAt: new Date("2026-05-12T10:00:00.000Z"),
        },
      ],
      connectorAccounts: [
        {
          id: "shopify-1",
          provider: ConnectorProvider.SHOPIFY,
          accountName: "Loja Shopify",
        },
        {
          id: "nuvemshop-1",
          provider: ConnectorProvider.NUVEMSHOP,
          accountName: "Loja Nuvemshop",
        },
        {
          id: "meta-1",
          provider: ConnectorProvider.META_ADS,
          accountName: "Meta Cliente",
        },
        {
          id: "google-1",
          provider: ConnectorProvider.GOOGLE_ADS,
          accountName: "Google Cliente",
        },
      ],
    });

    expect(snapshot.kpis.revenue.value).toBe(500);
    expect(snapshot.kpis.spend.value).toBe(150);
    expect(snapshot.kpis.orders.value).toBe(2);
    expect(snapshot.kpis.roas.value).toBe(3.33);
    expect(snapshot.platformRoas.meta.value).toBe(4);
    expect(snapshot.platformRoas.google.value).toBe(6);
    expect(snapshot.kpis.averageOrderValue.value).toBe(250);
    expect(snapshot.kpis.mediaRate.value).toBe(30);
    expect(snapshot.kpis.conversionRate.value).toBe(1.82);
    expect(snapshot.kpis.costPerSession.value).toBe(1.36);
    expect(snapshot.kpis.sessions.value).toBe(110);
    expect(snapshot.kpis.revenue.deltaPercent).toBe(400);
    expect(snapshot.funnel).toMatchObject({
      impressions: 1500,
      clicks: 140,
      sessions: 110,
      purchases: 6,
      orders: 2,
    });
    expect(snapshot.funnel.stages).toHaveLength(5);
    expect(snapshot.topCampaigns[0]).toMatchObject({
      campaignId: "c2",
      campaignName: "Performance Max",
      roas: 6,
    });
    expect(snapshot.lineSeries).toHaveLength(7);
    expect(snapshot.lineSeries.find((item) => item.date === "2026-05-10")).toMatchObject({
      revenue: 200,
      orders: 1,
      averageOrderValue: 200,
      mediaRate: 50,
    });
    expect(snapshot.lineSeries.find((item) => item.date === "2026-05-11")).toMatchObject({
      previousMediaRate: 50,
    });
    expect(snapshot.originMedia[0]).toMatchObject({
      label: "meta / cpc",
      value: 300,
      percent: 60,
    });
    expect(snapshot.connectorRanking).toHaveLength(4);
    expect(snapshot.connectorRanking[0]).toMatchObject({
      accountName: "Loja Nuvemshop",
      revenue: 300,
    });
    expect(snapshot.stateSales[0]).toMatchObject({
      label: "RJ",
      value: 300,
      percent: 60,
    });
    expect(snapshot.products[0]).toMatchObject({
      productName: "Produto B",
      quantitySold: 1,
      revenue: 300,
      status: "available",
    });
  });

  it("filters traffic and commerce providers before calculating blended ROAS", () => {
    const period = getDashboardPeriod(
      { period: "week" },
      new Date("2026-05-16T12:00:00.000Z"),
    );
    const snapshot = buildDashboardSnapshot({
      period,
      commerceProviders: [ConnectorProvider.SHOPIFY],
      trafficProviders: [ConnectorProvider.META_ADS],
      orders: [
        {
          connectorAccountId: "shopify-1",
          platform: ConnectorProvider.SHOPIFY,
          orderTotal: "500.00",
          placedAt: new Date("2026-05-10T10:00:00.000Z"),
        },
        {
          connectorAccountId: "nuvemshop-1",
          platform: ConnectorProvider.NUVEMSHOP,
          orderTotal: "900.00",
          placedAt: new Date("2026-05-10T10:00:00.000Z"),
        },
      ],
      metrics: [
        {
          connectorAccountId: "meta-1",
          source: ConnectorProvider.META_ADS,
          date: new Date("2026-05-10T00:00:00.000Z"),
          campaignId: "meta",
          campaignName: "Meta",
          spend: "100.00",
          impressions: BigInt(1),
          clicks: BigInt(1),
          sessions: BigInt(50),
          conversions: "1",
          conversionsValue: "500.00",
        },
        {
          connectorAccountId: "google-1",
          source: ConnectorProvider.GOOGLE_ADS,
          date: new Date("2026-05-10T00:00:00.000Z"),
          campaignId: "google",
          campaignName: "Google",
          spend: "300.00",
          impressions: BigInt(1),
          clicks: BigInt(1),
          sessions: BigInt(50),
          conversions: "1",
          conversionsValue: "900.00",
        },
      ],
    });

    expect(snapshot.kpis.revenue.value).toBe(500);
    expect(snapshot.kpis.spend.value).toBe(100);
    expect(snapshot.kpis.roas.value).toBe(5);
    expect(snapshot.kpis.mediaRate.value).toBe(20);
  });
});
