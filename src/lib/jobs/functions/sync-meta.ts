import { inngest } from "@/lib/jobs/inngest-client";
import { syncMetaDailyMetrics, type MetaSyncRange } from "@/lib/connectors/meta/sync";

type SyncMetaBackfillEvent = {
  connectorAccountId: string;
  range: MetaSyncRange;
};

export const syncMetaBackfill = inngest.createFunction(
  {
    id: "connector-meta-backfill",
    retries: 5,
    triggers: [{ event: "connector.meta.backfill" }],
  },
  async ({ event, step }) => {
    const data = event.data as SyncMetaBackfillEvent;

    return step.run("sync meta daily metrics", () =>
      syncMetaDailyMetrics({
        connectorAccountId: data.connectorAccountId,
        range: data.range,
      }),
    );
  },
);
