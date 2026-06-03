import { ConnectorProvider } from "@prisma/client";

import { syncEcommerceOrders } from "@/lib/connectors/ecommerce-sync";
import { syncGoogleAdsDailyMetrics } from "@/lib/connectors/google-ads/sync";
import { syncGoogleAnalyticsSessions } from "@/lib/connectors/google-analytics/sync";
import { syncMetaDailyMetrics } from "@/lib/connectors/meta/sync";
import type { ProductionSyncType } from "@/lib/jobs/sync-operations";

export type SyncHelperInput = {
  connectorAccountId: string;
  range: { since: string; until: string };
};

type SyncHelper = (input: SyncHelperInput) => Promise<unknown>;

const BACKFILL: ProductionSyncType = "BACKFILL";

export const SYNC_HELPERS: Partial<Record<ConnectorProvider, SyncHelper>> = {
  GOOGLE_SHEETS: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  ISET: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  TRAY: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  WBUY: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  MAGAZORD: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  NUVEMSHOP: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  SHOPIFY: (i) => syncEcommerceOrders({ ...i, syncType: BACKFILL }),
  META_ADS: (i) => syncMetaDailyMetrics({ ...i, syncType: BACKFILL }),
  GOOGLE_ADS: (i) => syncGoogleAdsDailyMetrics({ ...i, syncType: BACKFILL }),
  GA4: (i) => syncGoogleAnalyticsSessions({ ...i, syncType: BACKFILL }),
};

export function isoDaysAgo(days: number, now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function todayIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCHours(23, 59, 59, 999);
  return d.toISOString();
}
