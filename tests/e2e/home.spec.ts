import { expect, test } from "@playwright/test";

test("redirects public root into the login screen when unauthenticated", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Entrar na sua conta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar na sua conta" })).toBeVisible();
});

test("renders the signup form", async ({ page }) => {
  await page.goto("/sign-up");

  await expect(page.getByRole("heading", { name: "Criar conta grátis" })).toBeVisible();
  await expect(page.getByLabel("Empresa")).toBeVisible();
});
