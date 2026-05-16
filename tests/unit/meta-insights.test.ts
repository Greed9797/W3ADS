import { ConnectorProvider } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { normalizeMetaInsight } from "@/lib/connectors/meta/client";
import { mapMetaInsightToDailyMetric } from "@/lib/connectors/meta/sync";

describe("Meta insights normalization", () => {
  it("extracts purchase metrics using omni_purchase before pixel purchase", () => {
    const insight = normalizeMetaInsight({
      campaign_id: "123",
      campaign_name: "Campanha W3",
      spend: "42.10",
      impressions: "1000",
      clicks: "120",
      actions: [
        { action_type: "offsite_conversion.fb_pixel_purchase", value: "2" },
        { action_type: "omni_purchase", value: "3" },
      ],
      action_values: [{ action_type: "omni_purchase", value: "599.90" }],
      date_start: "2026-05-01",
      date_stop: "2026-05-01",
    });

    expect(insight).toMatchObject({
      campaignId: "123",
      campaignName: "Campanha W3",
      spend: "42.10",
      impressions: "1000",
      clicks: "120",
      conversions: "3",
      conversionsValue: "599.90",
    });
  });

  it("maps campaign insights to idempotent DailyMetric payloads", () => {
    const metric = mapMetaInsightToDailyMetric({
      workspaceId: "workspace-1",
      connectorAccountId: "connector-1",
      insight: {
        campaignId: "123",
        campaignName: "Campanha W3",
        spend: "42.10",
        impressions: "1000",
        clicks: "120",
        conversions: "3",
        conversionsValue: "599.90",
        dateStart: "2026-05-01",
        dateStop: "2026-05-01",
      },
    });

    expect(metric.source).toBe(ConnectorProvider.META_ADS);
    expect(metric.impressions).toBe(BigInt(1000));
    expect(metric.clicks).toBe(BigInt(120));
    expect(metric.dedupeHash).toHaveLength(64);
  });
});
