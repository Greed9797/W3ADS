import { expect, test } from "@playwright/test";

test("opens the dashboard without login while auth is disabled", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Central de crescimento W3" })).toBeVisible();
  await expect(page.getByText("Workspace Demo / OWNER")).toBeVisible();
  await expect(page.getByText("Performance Geral")).toBeVisible();
  await expect(page.getByText("Faturamento × Investimento")).toBeVisible();
  await expect(page.getByText("Top 10 campanhas por ROAS")).toBeVisible();
});

test("renders the signup form", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.getByRole("heading", { name: "Criar conta grátis" })).toBeVisible();
  await expect(page.getByLabel("Empresa")).toBeVisible();
});

test("renders connector cards in demo mode", async ({ page }) => {
  await page.goto("/connectors");

  await expect(page.getByRole("heading", { name: "Fontes de dados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meta Ads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Configurar env" })).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Google Ads" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shopify" })).toBeVisible();
});

test("creates a custom dashboard in demo mode", async ({ page }) => {
  await page.goto("/dashboards/new");

  await page.getByLabel("Nome").fill("Performance paga QA");
  await page.getByRole("button", { name: "Criar dashboard" }).click();

  await expect(page).toHaveURL(/\/dashboards\/demo-/);
  await expect(page.getByText("Dashboard criado.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Performance paga QA" })).toBeVisible();
  await expect(page.getByText("Biblioteca")).toBeVisible();

  await page.getByRole("link", { name: "Todos os dashboards" }).click();
  await expect(page.getByRole("heading", { name: "Painéis do workspace" })).toBeVisible();
  await expect(page.getByText("Performance paga QA")).toBeVisible();
});
