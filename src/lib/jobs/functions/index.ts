import { syncGoogleAdsBackfill } from "./sync-google-ads";
import { syncMetaBackfill } from "./sync-meta";
import { syncShopifyBackfill } from "./sync-shopify";

export const inngestFunctions = [syncMetaBackfill, syncGoogleAdsBackfill, syncShopifyBackfill];
