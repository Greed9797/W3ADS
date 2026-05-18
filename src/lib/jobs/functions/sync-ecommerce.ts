import { syncEcommerceOrders, type EcommerceSyncRange } from "@/lib/connectors/ecommerce-sync";
import { inngest } from "@/lib/jobs/inngest-client";

type SyncEcommerceBackfillEvent = {
  connectorAccountId: string;
  range: EcommerceSyncRange;
};

export const syncEcommerceBackfill = inngest.createFunction(
  {
    id: "connector-ecommerce-backfill",
    retries: 5,
    triggers: [{ event: "connector.ecommerce.backfill" }],
  },
  async ({ event, step }) => {
    const data = event.data as SyncEcommerceBackfillEvent;

    return step.run("sync ecommerce orders", () =>
      syncEcommerceOrders({
        connectorAccountId: data.connectorAccountId,
        range: data.range,
      }),
    );
  },
);
