import { ConnectorProvider } from "@prisma/client";

export type ConnectorBackfillRange = {
  since: string;
  until: string;
};

export type ConnectorBackfillEventName =
  | "connector.meta.backfill"
  | "connector.google_ads.backfill"
  | "connector.shopify.backfill";

export type ConnectorBackfillEvent = {
  name: ConnectorBackfillEventName;
  data: {
    connectorAccountId: string;
    range: ConnectorBackfillRange;
  };
};

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildBackfillRange(now = new Date(), lookbackDays = 90): ConnectorBackfillRange {
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - lookbackDays);

  return {
    since: dateOnly(since),
    until: dateOnly(until),
  };
}

function eventNameForProvider(provider: ConnectorProvider): ConnectorBackfillEventName {
  switch (provider) {
    case ConnectorProvider.META_ADS:
      return "connector.meta.backfill";
    case ConnectorProvider.GOOGLE_ADS:
      return "connector.google_ads.backfill";
    case ConnectorProvider.SHOPIFY:
      return "connector.shopify.backfill";
    default:
      throw new Error(`Provider ${provider} does not support MVP backfill`);
  }
}

export function buildConnectorBackfillEvent(input: {
  provider: ConnectorProvider;
  connectorAccountId: string;
  now?: Date;
}): ConnectorBackfillEvent {
  return {
    name: eventNameForProvider(input.provider),
    data: {
      connectorAccountId: input.connectorAccountId,
      range: buildBackfillRange(input.now),
    },
  };
}
