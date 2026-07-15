import { expect, type Page, test } from "@playwright/test";

const cookieConsentKey = "adstart_w3_cookie_consent";

async function startWithCookieConsent(page: Page) {
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(storageKey, "accepted");
  }, cookieConsentKey);
}

test("opens the dashboard with local QA bypass", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/dashboard");

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Faturamento", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/\/ Owner/)).toBeVisible();
  await expect(page.getByText("Valor investido")).toBeVisible();
  await expect(page.getByText("Custo de mídia")).toBeVisible();
  await expect(page.getByText("Qtd. de vendas")).toBeVisible();
  await expect(page.getByText("Pedidos aprovados")).toHaveCount(0);
  await expect(page.getByText("Tempo Real")).toHaveCount(0);
  await expect(page.getByText("Comp. de")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Personalizado", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Abrir calendário personalizado" }),
  ).toHaveCount(0);
  await expect(page.getByText("Período", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Personalizado", exact: true })
    .click();
  const selectedRange = page.getByRole("button", {
    name: /^\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}$/,
  });
  const selectedRangeText = await selectedRange.textContent();
  const selectedMonth = selectedRangeText?.match(/^\d{2}\/(\d{2})\/(\d{4})/);
  if (!selectedMonth) {
    throw new Error(
      `Unexpected custom range label: ${selectedRangeText ?? "empty"}`,
    );
  }
  const [, month, year] = selectedMonth;
  await expect(
    page.getByRole("button", { name: "Abrir calendário personalizado" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Abrir calendário personalizado" })
    .click();
  await page.getByRole("button", { name: "Dia 10" }).click();
  await page.getByRole("button", { name: "Dia 16" }).click();
  await page
    .getByRole("button", { name: "Aplicar período personalizado" })
    .click();
  await expect(page).toHaveURL(/period=custom/);
  await expect(page).toHaveURL(new RegExp(`from=${year}-${month}-10`));
  await expect(page).toHaveURL(new RegExp(`to=${year}-${month}-16`));
  await expect(page.getByRole("heading", { name: "Produtos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Categorias" })).toBeVisible();
  await expect(
    page.getByText(
      "Ainda não recebemos itens de pedido normalizados nesse período.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Ainda não recebemos categorias reais dos itens vendidos nesse período.",
    ),
  ).toBeVisible();
  await expect(page.locator(".recharts-pie-sector")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Campanhas Meta Ads" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Campanhas Google Ads" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Sem campanhas com investimento real no período selecionado.",
    ),
  ).toHaveCount(2);
  await expect(page.getByText("ACTIVE")).toHaveCount(0);
  await expect(page.getByText("OUTCOME_SALES")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Tabela de campanhas" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Feedback" })).toHaveCount(0);
  await expect(page.getByText("Total de pedidos por Estado")).toHaveCount(0);
  await expect(page.getByText("Top 10 campanhas por ROAS")).toHaveCount(0);
  await expect(page.getByText("Ranking interno de lojas e contas")).toHaveCount(
    0,
  );
});

test("renders the signup form", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/sign-up");

  await expect(
    page.getByRole("heading", { name: "Criar conta grátis" }),
  ).toBeVisible();
  await expect(page.getByLabel("Empresa")).toBeVisible();
});

test("renders connector cards for local QA user", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/connectors");

  await expect(
    page.getByRole("heading", { name: "Fontes de dados" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Meta Ads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Configurar no app" }),
  ).toHaveCount(12);
  await expect(page.getByRole("heading", { name: "Google Ads" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Google Analytics" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shopify" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Nuvemshop" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WBuy" })).toBeVisible();
});

test("renders connector provider settings for admin user", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/connectors/settings/meta_ads");

  await expect(
    page.getByRole("heading", { name: "Meta Ads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "System User Token (MVP)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /Access Token/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: /Ad Account ID/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conectar conta" }),
  ).toBeVisible();
});

test("renders account, workspace and role flow", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/workspace/settings", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Modelo Adstart de acesso" }),
  ).toBeVisible();
  await expect(
    page.getByText("conectores, tokens e métricas ficam sempre vinculados"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Workspaces da sua conta" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Criar marca" })).toBeVisible();

  await page.goto("/workspace/members", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Modelo de acesso" }),
  ).toBeVisible();
  await expect(
    page.getByText("Controle total do workspace").first(),
  ).toBeVisible();
  await expect(
    page.getByText("Consulta dashboards e status dos conectores").first(),
  ).toBeVisible();
});

test("renders the Admin Master marcas view", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/dashboards");

  await expect(
    page.getByRole("heading", { name: "Central de marcas" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Personalizado", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Total faturado")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "W3 Dev", exact: true }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.getByRole("link", { name: "Marcas" })).toBeVisible();
  }
});

test("renders LGPD profile flows", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/profile");

  await expect(
    page.getByRole("heading", { name: "Conta e privacidade" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Abrir exportação" }).click();
  await expect(
    page.getByRole("heading", { name: "Exportação de dados" }),
  ).toBeVisible();
  await expect(page.getByText(/@w3ads\.local/)).toBeVisible();

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
  await expect(
    page.getByRole("button", { name: "Usar tema claro" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Usar tema escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("submits beta feedback", async ({ page }) => {
  await startWithCookieConsent(page);
  await page.goto("/feedback");

  await expect(
    page.getByRole("heading", { name: "Enviar feedback" }),
  ).toBeVisible();
  await page.getByLabel("Tipo").selectOption("BUG");
  await page
    .getByLabel("Mensagem")
    .fill(
      "O card de ROAS precisa deixar mais claro quando nao existe investimento.",
    );
  await page.getByRole("button", { name: "Enviar feedback" }).click();

  await expect(page).toHaveURL(/\/feedback\?sent=1/);
  await expect(page.getByText("Feedback recebido.")).toBeVisible();
});
