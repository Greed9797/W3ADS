import { describe, expect, it } from "vitest";

import { getDashboardPeriod, toDateKey } from "@/lib/metrics/period";

describe("dashboard period", () => {
  it("builds the last 7 days range with previous period", () => {
    const period = getDashboardPeriod(
      { period: "7d" },
      new Date("2026-05-16T12:00:00.000Z"),
    );

    expect(toDateKey(period.from)).toBe("2026-05-10");
    expect(toDateKey(period.to)).toBe("2026-05-16");
    expect(toDateKey(period.previousFrom)).toBe("2026-05-03");
    expect(toDateKey(period.previousTo)).toBe("2026-05-09");
    expect(period.days).toBe(7);
  });

  it("uses custom dates when both boundaries are valid", () => {
    const period = getDashboardPeriod(
      { period: "custom", from: "2026-04-01", to: "2026-04-15" },
      new Date("2026-05-16T12:00:00.000Z"),
    );

    expect(toDateKey(period.from)).toBe("2026-04-01");
    expect(toDateKey(period.to)).toBe("2026-04-15");
    expect(period.days).toBe(15);
    expect(period.label).toBe("01/04/2026 - 15/04/2026");
  });
});
