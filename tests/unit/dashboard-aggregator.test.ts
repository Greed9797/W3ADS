import { describe, expect, it } from "vitest";

import {
  buildDashboardSnapshot,
  calculateDeltaPercent,
  calculateRoas,
} from "@/lib/metrics/aggregator";
import { getDashboardPeriod } from "@/lib/metrics/period";

describe("dashboard aggregator", () => {
  it("calculates ROAS and previous-period deltas", () => {
    expect(calculateRoas(1000, 250)).toBe(4);
    expect(calculateRoas(1000, 0)).toBe(0);
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
        { orderTotal: "200.00", placedAt: new Date("2026-05-10T10:00:00.000Z") },
        { orderTotal: "300.00", placedAt: new Date("2026-05-12T10:00:00.000Z") },
        { orderTotal: "100.00", placedAt: new Date("2026-05-04T10:00:00.000Z") },
      ],
      metrics: [
        {
          date: new Date("2026-05-10T00:00:00.000Z"),
          campaignId: "c1",
          campaignName: "Marca",
          spend: "100.00",
          impressions: BigInt(1000),
          clicks: BigInt(100),
          sessions: BigInt(80),
          conversionsValue: "400.00",
        },
        {
          date: new Date("2026-05-12T00:00:00.000Z"),
          campaignId: "c2",
          campaignName: "Performance Max",
          spend: "50.00",
          impressions: BigInt(500),
          clicks: BigInt(40),
          sessions: BigInt(30),
          conversionsValue: "300.00",
        },
        {
          date: new Date("2026-05-04T00:00:00.000Z"),
          campaignId: "old",
          campaignName: "Anterior",
          spend: "50.00",
          impressions: BigInt(200),
          clicks: BigInt(20),
          sessions: BigInt(12),
          conversionsValue: "0.00",
        },
      ],
    });

    expect(snapshot.kpis.revenue.value).toBe(500);
    expect(snapshot.kpis.spend.value).toBe(150);
    expect(snapshot.kpis.orders.value).toBe(2);
    expect(snapshot.kpis.roas.value).toBe(3.33);
    expect(snapshot.kpis.revenue.deltaPercent).toBe(400);
    expect(snapshot.funnel).toEqual({
      impressions: 1500,
      clicks: 140,
      sessions: 110,
      orders: 2,
    });
    expect(snapshot.topCampaigns[0]).toMatchObject({
      campaignId: "c2",
      campaignName: "Performance Max",
      roas: 6,
    });
    expect(snapshot.lineSeries).toHaveLength(7);
  });
});
