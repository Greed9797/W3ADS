import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus, SyncStatus } from "@prisma/client";

import {
  connectorAccessTokenFromAccount,
  connectorRefreshTokenFromAccount,
  vaultCredentialFields,
} from "@/lib/connectors/credentials";
import {
  buildGoogleAdsConfigFromProviderConfig,
  getActiveProviderConfig,
} from "@/lib/connectors/provider-config";
import { prisma } from "@/lib/db/prisma";

import { GoogleAdsClient, type GoogleAdsCampaignMetric } from "./client";

export type GoogleAdsSyncRange = {
  since: string;
  until: string;
};

const tokenRefreshSkewMs = 5 * 60 * 1000;

function tokenExpiresAt(expiresInSeconds: number | undefined) {
  return expiresInSeconds ? new Date(Date.now() + expiresInSeconds * 1000) : null;
}

export function googleAdsTokenNeedsRefresh(
  expiresAt: Date | null,
  now = new Date(),
  skewMs = tokenRefreshSkewMs,
) {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime() + skewMs);
}

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

export function mapGoogleAdsMetricToDailyMetric(input: {
  workspaceId: string;
  connectorAccountId: string;
  metric: GoogleAdsCampaignMetric;
}) {
  const { metric } = input;

  return {
    workspaceId: input.workspaceId,
    connectorAccountId: input.connectorAccountId,
    date: asDateOnly(metric.date),
    source: ConnectorProvider.GOOGLE_ADS,
    campaignId: metric.campaignId,
    campaignName: metric.campaignName,
    adsetId: null,
    adsetName: null,
    adId: null,
    spend: metric.spend,
    impressions: asBigInt(metric.impressions),
    clicks: asBigInt(metric.clicks),
    conversions: metric.conversions,
    conversionsValue: metric.conversionsValue,
    sessions: null,
    orders: null,
    revenue: null,
    dedupeHash: dedupeHash({
      workspaceId: input.workspaceId,
      connectorAccountId: input.connectorAccountId,
      date: metric.date,
      source: ConnectorProvider.GOOGLE_ADS,
      campaignId: metric.campaignId,
    }),
  };
}

export async function syncGoogleAdsDailyMetrics(input: {
  connectorAccountId: string;
  range: GoogleAdsSyncRange;
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
    const providerConfig = await getActiveProviderConfig({
      workspaceId: connector.workspaceId,
      provider: ConnectorProvider.GOOGLE_ADS,
    });
    if (!providerConfig) {
      throw new Error("Google Ads provider config is missing");
    }
    let accessToken = await connectorAccessTokenFromAccount(connector);
    const client = new GoogleAdsClient({
      config: await buildGoogleAdsConfigFromProviderConfig(providerConfig),
    });

    if (googleAdsTokenNeedsRefresh(connector.tokenExpiresAt)) {
      const refreshToken = await connectorRefreshTokenFromAccount(connector);
      if (!refreshToken) {
        await prisma.connectorAccount.update({
          where: { id: connector.id },
          data: {
            status: ConnectorStatus.TOKEN_EXPIRED,
            lastSyncError: "Google Ads refresh token is missing",
          },
        });
        throw new Error("Google Ads refresh token is missing");
      }

      const refreshed = await client.refreshAccessToken(refreshToken);
      const credentialFields = await vaultCredentialFields({
        workspaceId: connector.workspaceId,
        provider: ConnectorProvider.GOOGLE_ADS,
        externalAccountId: connector.externalAccountId,
        credentials: { accessToken: refreshed.access_token },
        refreshToken: refreshed.refresh_token ?? refreshToken,
        tokenExpiresAt: tokenExpiresAt(refreshed.expires_in),
      });

      accessToken = refreshed.access_token;

      await prisma.connectorAccount.update({
        where: { id: connector.id },
        data: {
          ...credentialFields,
          status: ConnectorStatus.ACTIVE,
          lastSyncError: null,
        },
      });
    }

    const metrics = await client.searchCampaignMetrics({
      accessToken,
      customerId: connector.externalAccountId,
      since: input.range.since,
      until: input.range.until,
      loginCustomerId:
        connector.metadata && typeof connector.metadata === "object" && "loginCustomerId" in connector.metadata
          ? String(connector.metadata.loginCustomerId)
          : undefined,
    });

    for (const metric of metrics) {
      const payload = mapGoogleAdsMetricToDailyMetric({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        metric,
      });

      await prisma.dailyMetric.upsert({
        where: { dedupeHash: payload.dedupeHash },
        update: payload,
        create: payload,
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
        rowsUpdated: metrics.length,
      },
    });

    return { rowsUpserted: metrics.length };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Unknown Google Ads sync error";
    const status = message.includes("refresh token") ? ConnectorStatus.TOKEN_EXPIRED : ConnectorStatus.ERROR;

    await prisma.connectorAccount.update({
      where: { id: input.connectorAccountId },
      data: {
        status,
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
