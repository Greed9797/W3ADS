import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/observability/client-error/route";

describe("POST /api/observability/client-error", () => {
  it("accepts sanitized client errors in demo mode", async () => {
    const request = new NextRequest("http://localhost/api/observability/client-error", {
      method: "POST",
      body: JSON.stringify({
        message: "Token abc failed for cliente@w3.com",
        path: "/dashboard?access_token=secret",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, mode: "demo" });
  });

  it("rejects invalid payloads", async () => {
    const request = new NextRequest("http://localhost/api/observability/client-error", {
      method: "POST",
      body: JSON.stringify({ message: "" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
