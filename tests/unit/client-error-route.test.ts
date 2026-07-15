import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user-1" } })),
}));

vi.mock("@/lib/audit/log", () => ({
  logAudit: vi.fn(async () => undefined),
}));

import { POST } from "@/app/api/observability/client-error/route";

describe("POST /api/observability/client-error", () => {
  it("accepts and sanitizes valid client errors", async () => {
    const request = new Request(
      "http://localhost/api/observability/client-error",
      {
        method: "POST",
        body: JSON.stringify({
          message: "Token abc failed for cliente@w3.com",
          path: "/dashboard?access_token=secret",
        }),
      },
    );

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("rejects invalid payloads", async () => {
    const request = new Request(
      "http://localhost/api/observability/client-error",
      {
        method: "POST",
        body: JSON.stringify({ message: "" }),
      },
    );

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
  });
});
