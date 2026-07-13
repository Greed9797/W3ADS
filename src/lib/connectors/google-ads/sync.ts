import { createHash } from "node:crypto";
import { ConnectorProvider, ConnectorStatus } from "@prisma/client";

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
import {
  createSyncJob,
  recordSyncFailure,
  recordSyncSuccess,
  throwClassifiedSyncFailure,
  type ProductionSyncType,
} from "@/lib/jobs/sync-operations";

import {
  GoogleAdsApiError,
  GoogleAdsClient,
  type GoogleAdsCampaignMetric,
} from "./client";

export type GoogleAdsSyncRange = {
  since: string;
  until: string;
};

const tokenRefreshSkewMs = 5 * 60 * 1000;

function tokenExpiresAt(expiresInSeconds: number | undefined) {
  return expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000)
    : null;
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
    campaignStatus: metric.campaignStatus,
    campaignObjective: metric.campaignObjective,
    adsetId: null,
    adsetName: null,
    adId: null,
    spend: metric.spend,
    impressions: asBigInt(metric.impressions),
    clicks: asBigInt(metric.clicks),
    addToCart: null,
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
  syncType?: ProductionSyncType;
}) {
  const connector = await prisma.connectorAccount.findUniqueOrThrow({
    where: { id: input.connectorAccountId },
  });
  const syncJob = await createSyncJob({
    connector,
    syncType: input.syncType ?? "BACKFILL",
    metadata: input.range,
  });

  try {
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
        connector.metadata &&
        typeof connector.metadata === "object" &&
        "loginCustomerId" in connector.metadata
          ? String(connector.metadata.loginCustomerId)
          : undefined,
    });

    const payloads = metrics.map((metric) =>
      mapGoogleAdsMetricToDailyMetric({
        workspaceId: connector.workspaceId,
        connectorAccountId: connector.id,
        metric,
      }),
    );
    if (payloads.length > 0) {
      await prisma.$transaction(
        payloads.map((payload) =>
          prisma.dailyMetric.upsert({
            where: { dedupeHash: payload.dedupeHash },
            update: payload,
            create: payload,
          }),
        ),
      );
    }

    await recordSyncSuccess({
      connectorAccountId: connector.id,
      syncJobId: syncJob.id,
      rowsUpdated: metrics.length,
    });

    return { rowsUpserted: metrics.length };
  } catch (caught) {
    let message =
      caught instanceof Error
        ? caught.message
        : "Unknown Google Ads sync error";
    if (
      caught instanceof GoogleAdsApiError &&
      caught.body &&
      !message.includes(":")
    ) {
      message = `${message} | body: ${caught.body.slice(0, 200)}`;
    }
    const classification = await recordSyncFailure({
      connectorAccountId: input.connectorAccountId,
      syncJobId: syncJob.id,
      previousFailureCount: connector.syncFailureCount,
      error: caught,
      message,
    });

    throwClassifiedSyncFailure({ classification, message, cause: caught });
  }
}
