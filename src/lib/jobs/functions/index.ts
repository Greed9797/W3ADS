import { syncGoogleAdsBackfill } from "./sync-google-ads";
import { syncEcommerceBackfill } from "./sync-ecommerce";
import { syncMetaBackfill } from "./sync-meta";
import { syncShopifyBackfill } from "./sync-shopify";

export const inngestFunctions = [
  syncMetaBackfill,
  syncGoogleAdsBackfill,
  syncShopifyBackfill,
  syncEcommerceBackfill,
];
