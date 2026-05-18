import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthDisabled } from "@/lib/auth/mode";

describe("auth mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps demo mode enabled by default outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_DISABLED", undefined);

    expect(isAuthDisabled()).toBe(true);
  });

  it("never disables auth by default in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DISABLED", undefined);

    expect(isAuthDisabled()).toBe(false);
  });

  it("honors explicit production auth mode flags", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DISABLED", "true");
    expect(isAuthDisabled()).toBe(true);

    vi.stubEnv("AUTH_DISABLED", "false");
    expect(isAuthDisabled()).toBe(false);
  });
});
