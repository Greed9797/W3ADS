import { describe, expect, it } from "vitest";

import {
  classifyRateLimitTarget,
  rateLimitConfigError,
} from "@/lib/security/rate-limit";

describe("production rate limit helpers", () => {
  it("classifies sensitive auth, connector and webhook requests", () => {
    expect(classifyRateLimitTarget({ pathname: "/login", method: "POST" })).toMatchObject({
      keyPrefix: "auth",
      limit: 10,
    });
    expect(classifyRateLimitTarget({ pathname: "/api/auth/callback/google", method: "POST" })).toMatchObject({
      keyPrefix: "auth",
      limit: 10,
    });
    expect(classifyRateLimitTarget({ pathname: "/api/connectors/meta/callback", method: "GET" })).toMatchObject({
      keyPrefix: "connectors",
      limit: 60,
    });
    expect(classifyRateLimitTarget({ pathname: "/api/webhooks/shopify", method: "POST" })).toMatchObject({
      keyPrefix: "webhooks",
      limit: 300,
    });
  });

  it("does not rate limit normal navigation GETs", () => {
    expect(classifyRateLimitTarget({ pathname: "/dashboard", method: "GET" })).toBeNull();
    expect(classifyRateLimitTarget({ pathname: "/login", method: "GET" })).toBeNull();
  });

  it("treats missing Upstash envs as production misconfiguration", () => {
    expect(rateLimitConfigError({ NODE_ENV: "production" })).toBe(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required for production rate limiting.",
    );
    expect(
      rateLimitConfigError({
        NODE_ENV: "production",
        UPSTASH_REDIS_REST_URL: "https://redis.example.com",
        UPSTASH_REDIS_REST_TOKEN: "token",
      }),
    ).toBeNull();
  });
});
