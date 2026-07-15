import nextEnv from "@next/env";
import { defineConfig, devices } from "@playwright/test";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const playwrightBaseUrl = "http://127.0.0.1:3100";
const safeDatabaseNames = /(?:^|[_-])(?:ci|e2e|test)(?:[_-]|$)/i;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function requireSafeDatabaseUrl(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Playwright E2E tests.`);
  }

  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !loopbackHosts.has(url.hostname) ||
    !safeDatabaseNames.test(databaseName)
  ) {
    throw new Error(
      `${name} must target a loopback PostgreSQL database named for CI, E2E, or tests.`,
    );
  }

  return value;
}

const databaseUrl = requireSafeDatabaseUrl("DATABASE_URL");
const directUrl = requireSafeDatabaseUrl("DIRECT_URL");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  workers: 1,
  use: {
    baseURL: playwrightBaseUrl,
    storageState: {
      cookies: [
        {
          name: "authjs.session-token",
          value: "playwright-local-qa-bypass",
          domain: "127.0.0.1",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    trace: "on-first-retry",
  },
  webServer: {
    command: "npx next dev --hostname 127.0.0.1 --port 3100",
    env: {
      AUTH_SECRET: "playwright-local-secret-playwright-local-secret",
      NEXTAUTH_SECRET: "playwright-local-secret-playwright-local-secret",
      DATABASE_URL: databaseUrl,
      DIRECT_URL: directUrl,
      DEV_AUTH_BYPASS_EMAIL:
        process.env.DEV_AUTH_BYPASS_EMAIL ?? "gustavo@w3ads.local",
    },
    url: playwrightBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
