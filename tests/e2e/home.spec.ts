import { expect, type Page, test } from "@playwright/test";

const cookieConsentKey = "adstart_w3_cookie_consent";

async function startWithCookieConsent(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "accepted");
  }, cookieConsentKey);
}

test("opens the dashboard without login while auth is disabled", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Central de crescimento W3" })).toBeVisible();
  await expect(page.getByText("Workspace Demo / Owner")).toBeVisible();
  await expect(page.getByText("Valor investido")).toBeVisible();
  await expect(page.getByText("Custo de mídia")).toBeVisible();
  await expect(page.getByText("Pedidos aprovados")).toBeVisible();
  await expect(page.getByText("Total de pedidos por Estado")).toBeVisible();
  await expect(page.getByText("Top 10 campanhas por ROAS")).toBeVisible();
});

test("renders the signup form", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/sign-up");

  await expect(page.getByRole("heading", { name: "Criar conta grátis" })).toBeVisible();
  await expect(page.getByLabel("Empresa")).toBeVisible();
});

test("renders connector cards in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/connectors");

  await expect(page.getByRole("heading", { name: "Fontes de dados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meta Ads" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Configurar no app" })).toHaveCount(10);
  await expect(page.getByRole("heading", { name: "Google Ads" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Analytics" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shopify" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuvemshop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WBuy" })).toBeVisible();
});

test("renders connector provider settings in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/connectors/settings/meta_ads");

  await expect(page.getByRole("heading", { name: "Meta Ads" })).toBeVisible();
  await expect(page.getByLabel("Meta App ID")).toBeVisible();
  await expect(page.getByLabel("Meta App Secret")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salvar configuração" })).toBeVisible();
});

test("renders account, workspace and role flow in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/workspace/settings");

  await expect(page.getByRole("heading", { name: "Modelo Adstart de acesso" })).toBeVisible();
  await expect(page.getByText("conectores, tokens e métricas ficam sempre vinculados")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspaces da sua conta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar como Owner" })).toBeVisible();

  await page.goto("/workspace/members");
  await expect(page.getByRole("heading", { name: "Modelo de acesso" })).toBeVisible();
  await expect(page.getByText("Controle total do workspace").first()).toBeVisible();
  await expect(page.getByText("Consulta dashboards e status dos conectores").first()).toBeVisible();
});

test("renders the Admin Master marcas view in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/dashboards");

  await expect(page.getByRole("heading", { name: "Central de marcas" })).toBeVisible();
  await expect(page.getByText("Total faturado")).toBeVisible();
  await expect(page.getByText("The Greg's Parfums")).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.getByRole("link", { name: "Marcas" })).toBeVisible();
  }
});

test("renders LGPD profile flows in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/profile");

  await expect(page.getByRole("heading", { name: "Conta e privacidade" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir exportação" }).click();
  await expect(page.getByRole("heading", { name: "Exportação de dados" })).toBeVisible();
  await expect(page.getByText("demo@adstartw3.local")).toBeVisible();

  await page.goto("/profile/delete-account");
  await page.getByLabel("Email de confirmação").fill("email-errado@w3.com");
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByText("O email digitado não confere")).toBeVisible();
});

test("accepts cookie consent banner", async ({ page }) => {
  await page.goto("/dashboard");

  const consentButton = page.getByRole("button", { name: "Entendi" });
  await expect(consentButton).toBeVisible();
  await consentButton.click({ force: true });
  await expect(consentButton).toBeHidden();
});

test("toggles between Grupo W3 dark and light themes", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/dashboard");

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Usar tema claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Usar tema claro" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("submits beta feedback in demo mode", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/feedback");

  await expect(page.getByRole("heading", { name: "Enviar feedback" })).toBeVisible();
  await page.getByLabel("Tipo").selectOption("BUG");
  await page
    .getByLabel("Mensagem")
    .fill("O card de ROAS precisa deixar mais claro quando nao existe investimento.");
  await page.getByRole("button", { name: "Enviar feedback" }).click();

  await expect(page).toHaveURL(/\/feedback\?sent=1/);
  await expect(page.getByText("Feedback recebido.")).toBeVisible();
});
