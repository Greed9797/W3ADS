import { describe, expect, it } from "vitest";

import { buildAnalyticsEvent, isPostHogEnabled } from "@/lib/observability/analytics";

describe("analytics helpers", () => {
  it("keeps PostHog disabled when no public key exists", () => {
    expect(isPostHogEnabled({})).toBe(false);
    expect(isPostHogEnabled({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" })).toBe(true);
  });

  it("builds a safe analytics event without PII", () => {
    expect(
      buildAnalyticsEvent({
        name: "dashboard_view",
        userId: "user-1",
        workspaceId: "workspace-1",
        properties: {
          email: "cliente@w3.com",
          period: "30d",
        },
      }),
    ).toEqual({
      name: "dashboard_view",
      distinctId: "user-1",
      properties: {
        workspaceId: "workspace-1",
        period: "30d",
      },
    });
  });
});
