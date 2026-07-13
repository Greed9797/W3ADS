import { ConnectorStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  classifySyncFailure,
  nextSyncRetryAt,
  syncRetryDelayMs,
} from "@/lib/connectors/sync-failure";

describe("sync failure policy", () => {
  it.each([
    "HTTP 503 from provider",
    "fetch failed: ECONNRESET",
    "request timed out",
    "HTTP 429 too many requests",
    "Supabase connection refused",
  ])("treats %s as transient", (message) => {
    expect(classifySyncFailure(new Error(message))).toEqual({
      kind: "TRANSIENT",
    });
  });

  it("treats expired credentials as permanent token failures", () => {
    expect(classifySyncFailure(new Error("refresh token expired"))).toEqual({
      kind: "PERMANENT",
      status: ConnectorStatus.TOKEN_EXPIRED,
    });
  });

  it.each([
    "HTTP 403 permission denied",
    "Meta provider config is missing",
    "Credentials missing: no vault secret and no inline ciphertext",
    "HTTP 404 account not found",
  ])("treats %s as a permanent connector failure", (message) => {
    expect(classifySyncFailure(new Error(message))).toEqual({
      kind: "PERMANENT",
      status: ConnectorStatus.ERROR,
    });
  });

  it("defaults unknown errors to transient so connectors are not bricked", () => {
    expect(classifySyncFailure(new Error("unexpected parser failure"))).toEqual({
      kind: "TRANSIENT",
    });
  });

  it("uses progressive delays capped at six hours", () => {
    expect(syncRetryDelayMs(1, () => 0)).toBe(5 * 60 * 1000);
    expect(syncRetryDelayMs(2, () => 0)).toBe(10 * 60 * 1000);
    expect(syncRetryDelayMs(20, () => 0)).toBe(6 * 60 * 60 * 1000);
  });

  it("calculates the next retry timestamp from the failure count", () => {
    const now = new Date("2026-07-13T12:00:00.000Z");

    expect(nextSyncRetryAt(now, 1, () => 0)).toEqual(
      new Date("2026-07-13T12:05:00.000Z"),
    );
  });
});
