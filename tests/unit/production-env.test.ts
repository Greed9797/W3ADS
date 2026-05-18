import { describe, expect, it } from "vitest";

import {
  productionEnvErrors,
  shouldValidateProductionEnv,
} from "../../scripts/validate-production-env.mjs";

describe("production env validation", () => {
  it("fails production builds when demo auth is enabled", () => {
    expect(
      productionEnvErrors({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        AUTH_DISABLED: "true",
        AUTH_SECRET: "secret",
        DATABASE_URL: "postgresql://db",
        DIRECT_URL: "postgresql://db",
      }),
    ).toContain("AUTH_DISABLED must be false or empty in production.");
  });

  it("requires the operational production envs that cannot be configured in the app", () => {
    expect(
      productionEnvErrors({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        AUTH_DISABLED: "false",
      }),
    ).toEqual([
      "AUTH_SECRET or NEXTAUTH_SECRET is required in production.",
      "DATABASE_URL is required in production.",
      "DIRECT_URL is required in production.",
    ]);
  });

  it("runs only for production-like environments", () => {
    expect(shouldValidateProductionEnv({ NODE_ENV: "development" })).toBe(false);
    expect(shouldValidateProductionEnv({ VERCEL_ENV: "preview" })).toBe(false);
    expect(shouldValidateProductionEnv({ NODE_ENV: "production" })).toBe(true);
    expect(shouldValidateProductionEnv({ VERCEL_ENV: "production" })).toBe(true);
  });
});
