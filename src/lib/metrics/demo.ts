import { ConnectorProvider } from "@prisma/client";

import { buildDashboardSnapshot } from "./aggregator";
import { listDateKeys, type DashboardPeriod } from "./period";

export function getDemoDashboardSnapshot(
  period: DashboardPeriod,
  filters: {
    trafficProviders?: ConnectorProvider[];
    commerceProviders?: ConnectorProvider[];
  } = {},
) {
  const orders = [];
  const orderItems = [];
  const metrics = [];
  const allDates = listDateKeys(period.previousFrom, period.to);

  for (const [index, date] of allDates.entries()) {
    const isCurrent = date >= period.from.toISOString().slice(0, 10);
    const multiplier = isCurrent ? 1.18 : 1;
    const weekdayFactor = index % 6 === 0 ? 1.35 : 1;
    const spend = Number((820 * multiplier * weekdayFactor + index * 18).toFixed(2));
    const conversionsValue = Number((spend * (3.2 + (index % 5) * 0.18)).toFixed(2));
    const orderCount = Math.max(1, Math.round(conversionsValue / 420));

    metrics.push(
      {
        date: new Date(`${date}T00:00:00.000Z`),
        connectorAccountId: "demo-meta",
        source: ConnectorProvider.META_ADS,
        campaignId: "meta-prospeccao",
        campaignName: "Meta - Prospecção W3",
        spend: (spend * 0.52).toFixed(2),
        impressions: BigInt(Math.round(spend * 132)),
        clicks: BigInt(Math.round(spend * 5.8)),
        sessions: BigInt(Math.round(spend * 4.2)),
        conversions: (orderCount * 0.46).toFixed(2),
        conversionsValue: (conversionsValue * 0.46).toFixed(2),
      },
      {
        date: new Date(`${date}T00:00:00.000Z`),
        connectorAccountId: "demo-google",
        source: ConnectorProvider.GOOGLE_ADS,
        campaignId: "google-pmax",
        campaignName: "Google - Performance Max",
        spend: (spend * 0.34).toFixed(2),
        impressions: BigInt(Math.round(spend * 84)),
        clicks: BigInt(Math.round(spend * 3.4)),
        sessions: BigInt(Math.round(spend * 2.8)),
        conversions: (orderCount * 0.38).toFixed(2),
        conversionsValue: (conversionsValue * 0.38).toFixed(2),
      },
      {
        date: new Date(`${date}T00:00:00.000Z`),
        connectorAccountId: "demo-google",
        source: ConnectorProvider.GOOGLE_ADS,
        campaignId: "google-search-marca",
        campaignName: "Google - Search Marca",
        spend: (spend * 0.14).toFixed(2),
        impressions: BigInt(Math.round(spend * 28)),
        clicks: BigInt(Math.round(spend * 1.9)),
        sessions: BigInt(Math.round(spend * 1.5)),
        conversions: (orderCount * 0.16).toFixed(2),
        conversionsValue: (conversionsValue * 0.16).toFixed(2),
      },
    );

    for (let orderIndex = 0; orderIndex < orderCount; orderIndex += 1) {
      const orderTotal = Number((conversionsValue / orderCount).toFixed(2));
      const platform = orderIndex % 3 === 0 ? ConnectorProvider.NUVEMSHOP : ConnectorProvider.SHOPIFY;
      const connectorAccountId = orderIndex % 3 === 0 ? "demo-nuvemshop" : "demo-shopify";

      orders.push({
        connectorAccountId,
        platform,
        orderTotal: orderTotal.toFixed(2),
        itemsCount: 1 + (orderIndex % 4),
        shippingState: ["SP", "RJ", "MG", "PR", "SC"][orderIndex % 5],
        utmSource: orderIndex % 2 === 0 ? "google" : "meta",
        utmMedium: orderIndex % 2 === 0 ? "organic" : "cpc",
        utmCampaign: orderIndex % 2 === 0 ? "marca" : "prospeccao",
        placedAt: new Date(`${date}T${String(10 + (orderIndex % 10)).padStart(2, "0")}:00:00.000Z`),
      });
      orderItems.push({
        productName: ["Produto W3 A", "Produto W3 B", "Produto W3 C"][orderIndex % 3],
        quantity: 1 + (orderIndex % 2),
        total: orderTotal.toFixed(2),
        placedAt: new Date(`${date}T${String(10 + (orderIndex % 10)).padStart(2, "0")}:00:00.000Z`),
      });
    }
  }

  return buildDashboardSnapshot({
    period,
    orders,
    orderItems,
    metrics,
    connectorAccounts: [
      {
        id: "demo-meta",
        provider: ConnectorProvider.META_ADS,
        accountName: "Meta Ads W3",
      },
      {
        id: "demo-google",
        provider: ConnectorProvider.GOOGLE_ADS,
        accountName: "Google Ads W3",
      },
      {
        id: "demo-shopify",
        provider: ConnectorProvider.SHOPIFY,
        accountName: "Shopify Demo",
      },
      {
        id: "demo-nuvemshop",
        provider: ConnectorProvider.NUVEMSHOP,
        accountName: "Nuvemshop Demo",
      },
    ],
    trafficProviders: filters.trafficProviders,
    commerceProviders: filters.commerceProviders,
  });
}
