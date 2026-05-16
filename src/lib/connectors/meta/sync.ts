import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";

import { decryptToken } from "@/lib/crypto/token-vault";
import { prisma } from "@/lib/db/prisma";

import { MetaMarketingClient, type MetaCampaignInsight } from "./client";

export type MetaSyncRange = {
  since: string;
  until: string;
};

function asDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function asBigInt(value: string | null) {
  return value ? BigInt(value) : null;
}

function dedupeHash(input: {
  workspaceId: string;
  connectorAccountId: string;
  date: string;
  source: ConnectorProvider;
  campaignId: string | null;
}) {
  return createHash("sha256")
    .update(
      [
        input.workspaceId,
        input.connectorAccountId,
        input.date,
        input.source,
        input.campaignId ?? "",
      ].join(":"),
    )
    .digest("hex");
}

export function mapMetaInsightToDailyMetric(input: {
  workspaceId: string;
  connectorAccountId: string;
  insight: MetaCampaignInsight;
}) {
  const { insight } = input;

  return {
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    date: asDateOnly(insight.dateStart),
    source: ConnectorProvider.META_ADS,
    campaignId: insight.campaignId,
    campaignName: insight.campaignName,
    adsetId: null,
    adsetName: null,
    adId: null,
    spend: insight.spend,
    impressions: asBigInt(insight.impressions),
    clicks: asBigInt(insight.clicks),
    conversions: insight.conversions,
    conversionsValue: insight.conversionsValue,
    sessions: null,
    orders: null,
    revenue: null,
    dedupeHash: dedupeHash({
      workspaceId: input.workspaceId,
      connectorAccountId: input.connectorAccountId,
      date: insight.dateStart,
      source: ConnectorProvider.META_ADS,
      campaignId: insight.campaignId,
    }),
  };
}

export async function syncMetaDailyMetrics(input: {
  connectorAccountId: string;
  range: MetaSyncRange;
}) {
  const syncJob = await prisma.syncJob.create({
    data: {
      connectorAccountId: input.connectorAccountId,
      status: SyncStatus.RUNNING,
      metadata: input.range,
    },
  });

  try {
    const connector = await prisma.connectorAccount.findUniqueOrThrow({
      where: { id: input.connectorAccountId },
    });

    const accessToken = decryptToken({
      ciphertext: connector.accessTokenCiphertext,
      iv: connector.tokenIv,
      authTag: connector.tokenAuthTag,
      keyVersion: connector.tokenKeyVersion,
    });
    const client = new MetaMarketingClient();
    const insights = await client.getCampaignInsights({
      accessToken,
      adAccountId: connector.externalAccountId,
      since: input.range.since,
      until: input.range.until,
    });

    for (const insight of insights) {
      const metric = mapMetaInsightToDailyMetric({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        insight,
      });

      await prisma.dailyMetric.upsert({
        where: { dedupeHash: metric.dedupeHash },
        update: metric,
        create: metric,
      });
    }

    await prisma.connectorAccount.update({
      where: { id: connector.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncError: null,
        status: ConnectorStatus.ACTIVE,
      },
    });
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: SyncStatus.SUCCESS,
        finishedAt: new Date(),
        rowsUpdated: insights.length,
      },
    });

    return { rowsUpserted: insights.length };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unknown Meta sync error";

    await prisma.connectorAccount.update({
      where: { id: input.connectorAccountId },
      data: {
        status: ConnectorStatus.ERROR,
        lastSyncError: message,
      },
    });
    await prisma.syncJob.update({
      where: { id: syncJob.id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage: message,
      },
    });

    throw caught;
  }
}
