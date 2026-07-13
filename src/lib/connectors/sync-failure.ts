import { ConnectorStatus } from "@prisma/client";

export type SyncFailureKind = "TRANSIENT" | "PERMANENT";

export type SyncFailureClassification = {
  kind: SyncFailureKind;
  status?: ConnectorStatus;
};

export const SYNC_RETRY_BASE_MS = 5 * 60 * 1000;
export const SYNC_RETRY_MAX_MS = 6 * 60 * 60 * 1000;

type ErrorWithResponse = {
  status?: number;
  code?: string;
  response?: {
    status?: number;
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as ErrorWithResponse;
  return candidate.status ?? candidate.response?.status;
}

function embeddedStatus(message: string) {
  const match = message.match(/\b(?:http|status(?: code)?|code)\s*[:=]?\s*(\d{3})\b/i);
  return match ? Number(match[1]) : undefined;
}

const KNOWN_TRANSIENT_FAILURE_PATTERN =
  /\b408\b|\b425\b|\b429\b|\b50[0-9]\b|timeout|timed out|etimedout|econnreset|econnrefused|enotfound|network|socket hang up|temporarily|service unavailable|bad gateway|supabase/i;

/**
 * Existing ERROR rows are recovered conservatively: only failures with an
 * explicit transport/provider outage signal are reactivated automatically.
 * Unknown historical errors remain blocked for manual inspection.
 */
export function isKnownTransientSyncFailure(error: unknown) {
  const status = errorStatus(error);
  return (
    (status !== undefined &&
      (status === 408 || status === 425 || status === 429 || status >= 500)) ||
    KNOWN_TRANSIENT_FAILURE_PATTERN.test(errorMessage(error))
  );
}

/**
 * Classifies failures at the connector boundary. Unknown failures stay
 * retryable so a new provider/network failure cannot permanently brick an
 * account by moving it to ERROR.
 */
export function classifySyncFailure(
  error: unknown,
): SyncFailureClassification {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  const status = errorStatus(error) ?? embeddedStatus(message);

  if (
    status === 401 ||
    /\b401\b|invalid access token|invalid token|token.*(?:expired|revoked|missing)|refresh token|reauth|unauthorized|oauth.*(?:token|credential|auth)/.test(
      lower,
    )
  ) {
    return { kind: "PERMANENT", status: ConnectorStatus.TOKEN_EXPIRED };
  }

  if (
    status === 403 ||
    status === 404 ||
    /\b403\b|\b404\b|permission|forbidden|insufficient|not granted|not found|no such|provider config is missing|credentials missing|no credentials|secret not found/.test(
      lower,
    )
  ) {
    return { kind: "PERMANENT", status: ConnectorStatus.ERROR };
  }

  if (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![408, 425, 429].includes(status)
  ) {
    return { kind: "PERMANENT", status: ConnectorStatus.ERROR };
  }

  return { kind: "TRANSIENT" };
}

export function syncRetryDelayMs(
  failureCount: number,
  random: () => number = Math.random,
) {
  const normalizedCount = Math.max(1, Math.floor(failureCount));
  const exponential = SYNC_RETRY_BASE_MS * 2 ** (normalizedCount - 1);
  const capped = Math.min(exponential, SYNC_RETRY_MAX_MS);
  const jitter = 0.8 + Math.min(Math.max(random(), 0), 1) * 0.4;

  return Math.min(Math.round(capped * jitter), SYNC_RETRY_MAX_MS);
}

export function nextSyncRetryAt(
  now: Date,
  failureCount: number,
  random: () => number = Math.random,
) {
  return new Date(now.getTime() + syncRetryDelayMs(failureCount, random));
}
