import { expect, test } from "@playwright/test";

test("renders the W3 dashboard shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Central de crescimento W3" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Conectar minha primeira conta/ })).toBeVisible();
  await expect(page.getByText("Top campanhas por ROAS")).toBeVisible();
});
