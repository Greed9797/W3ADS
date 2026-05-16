import { expect, test } from "@playwright/test";

test("opens the dashboard without login while auth is disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Central de crescimento W3" })).toBeVisible();
  await expect(page.getByText("Workspace Demo / OWNER")).toBeVisible();
});

test("renders the signup form", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.getByRole("heading", { name: "Criar conta grátis" })).toBeVisible();
  await expect(page.getByLabel("Empresa")).toBeVisible();
});

test("renders connector cards in demo mode", async ({ page }) => {
  await page.goto("/connectors");

  await expect(page.getByRole("heading", { name: "Fontes de dados" })).toBeVisible();
  await expect(page.getByText("Meta Ads")).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurar env" })).toBeVisible();
  await expect(page.getByText("Google Ads")).toBeVisible();
  await expect(page.getByText("Shopify")).toBeVisible();
});
