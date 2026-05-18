import { ConnectorProvider } from "@prisma/client";
import { Cable, CircleAlert, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { EventTracker } from "@/components/observability/event-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { getGoogleAdsConfigStatus } from "@/lib/connectors/google-ads/oauth";
import { getMetaConfigStatus } from "@/lib/connectors/meta/oauth";
import { getNuvemshopConfigStatus } from "@/lib/connectors/nuvemshop/oauth";
import {
  getConnectorDefinition,
  manualCommerceProviders,
} from "@/lib/connectors/registry";
import { getShopifyConfigStatus } from "@/lib/connectors/shopify/oauth";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils/cn";

type ConnectorsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ProviderCard = {
  name: string;
  description: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "info";
  action: ReactNode;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function statusClass(tone: ProviderCard["statusTone"]) {
  return cn(
    "inline-flex rounded-[var(--radius-pill)] px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em]",
    tone === "success" && "bg-[var(--success-bg)] text-[var(--success)]",
    tone === "warning" && "bg-[var(--warning-bg)] text-[var(--warning)]",
    tone === "info" && "bg-[var(--info-bg)] text-[var(--info)]",
  );
}

function connectorMessage(error: string | undefined, connected: string | undefined) {
  if (connected === "meta") {
    return {
      tone: "success" as const,
      title: "Meta conectada.",
      body: "As contas de anuncio retornadas pela API foram salvas com token criptografado.",
    };
  }

  if (connected === "google-ads") {
    return {
      tone: "success" as const,
      title: "Google Ads conectado.",
      body: "As contas acessiveis foram salvas com token criptografado e prontas para backfill.",
    };
  }

  if (connected === "shopify") {
    return {
      tone: "success" as const,
      title: "Shopify conectada.",
      body: "A loja foi salva com token criptografado e pronta para sincronizar pedidos.",
    };
  }

  if (connected === "nuvemshop") {
    return {
      tone: "success" as const,
      title: "Nuvemshop conectada.",
      body: "A loja selecionada foi salva com credenciais criptografadas e pronta para sincronizar pedidos.",
    };
  }

  if (connected && ["iset", "tray", "wbuy", "magazord"].includes(connected)) {
    return {
      tone: "success" as const,
      title: "Loja conectada.",
      body: "Validamos as credenciais antes de salvar e a sincronizacao de pedidos ja pode rodar.",
    };
  }

  if (connected === "demo") {
    return {
      tone: "info" as const,
      title: "OAuth recebido em modo demo.",
      body: "Como o login e o Supabase estao desativados agora, nao gravamos a conexao no banco.",
    };
  }

  if (!error) {
    return null;
  }

  const messages: Record<string, string> = {
    "invalid-state": "O retorno da Meta nao passou na validacao de seguranca. Tente conectar de novo.",
    "missing-code": "A Meta nao retornou o codigo de autorizacao. Tente conectar novamente.",
    "missing-env": "Configure META_APP_ID, META_APP_SECRET e META_REDIRECT_URI para iniciar o OAuth.",
    "missing-token-key": "Configure TOKEN_ENCRYPTION_KEY antes de salvar tokens OAuth.",
    "meta-api": "Nao conseguimos concluir a conexao com a Meta agora. Tente novamente em alguns minutos.",
    "google-ads-api":
      "Nao conseguimos concluir a conexao com o Google Ads agora. Confira o developer token e tente novamente.",
    "invalid-hmac": "A assinatura retornada pela Shopify nao passou na validacao HMAC.",
    "invalid-shop": "Informe uma loja Shopify valida, como loja.myshopify.com.",
    "provider-denied": "A autorizacao foi cancelada no provedor.",
    "missing-google-ads-env":
      "Configure GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN e GOOGLE_ADS_REDIRECT_URI.",
    "missing-shop": "Informe o dominio da loja Shopify antes de conectar.",
    "missing-shopify-env":
      "Configure SHOPIFY_APP_API_KEY, SHOPIFY_APP_API_SECRET e SHOPIFY_REDIRECT_URI.",
    "shopify-api": "Nao conseguimos concluir a conexao com a Shopify agora. Tente novamente em alguns minutos.",
    "missing-nuvemshop-env":
      "Configure NUVEMSHOP_CLIENT_ID, NUVEMSHOP_CLIENT_SECRET e NUVEMSHOP_REDIRECT_URI.",
    "nuvemshop-api":
      "Nao conseguimos concluir a conexao com a Nuvemshop agora. Tente novamente em alguns minutos.",
    "missing-selection": "Selecione pelo menos uma conta antes de vincular.",
    "selection-expired": "A selecao expirou. Inicie a conexao novamente.",
    "selection-failed": "Nao conseguimos salvar a selecao agora. Tente novamente.",
    "invalid-manual-connector": "Revise os dados da loja e tente novamente.",
    "manual-credentials":
      "Nao conseguimos validar essas credenciais. Confira a URL, caminho de pedidos e chaves da API.",
  };

  return {
    tone: "warning" as const,
    title: "Conexao nao concluida.",
    body: messages[error] ?? "Nao conseguimos concluir a conexao agora.",
  };
}

export default async function ConnectorsPage({ searchParams }: ConnectorsPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const connectedProvider = firstParam(params.connected);
  const message = connectorMessage(firstParam(params.error), firstParam(params.connected));
  const metaStatus = getMetaConfigStatus();
  const googleAdsStatus = getGoogleAdsConfigStatus();
  const shopifyStatus = getShopifyConfigStatus();
  const nuvemshopStatus = getNuvemshopConfigStatus();
  const connectorCounts = new Map<ConnectorProvider, number>();
  if (!context.isDemoMode) {
    const connectors = await prisma.connectorAccount.groupBy({
      by: ["provider"],
      where: {
        workspaceId: context.currentWorkspace.id,
      },
      _count: { provider: true },
    });

    for (const connector of connectors) {
      connectorCounts.set(connector.provider, connector._count.provider);
    }
  }

  const metaAccounts = connectorCounts.get(ConnectorProvider.META_ADS) ?? 0;
  const googleAdsAccounts = connectorCounts.get(ConnectorProvider.GOOGLE_ADS) ?? 0;
  const shopifyAccounts = connectorCounts.get(ConnectorProvider.SHOPIFY) ?? 0;
  const nuvemshopAccounts = connectorCounts.get(ConnectorProvider.NUVEMSHOP) ?? 0;

  const providerCards: ProviderCard[] = [
    {
      name: "Meta Ads",
      description: context.isDemoMode
        ? "OAuth preparado. Com AUTH_DISABLED=true, o callback valida estado mas nao grava token."
        : "Conecte o perfil e vincule somente as contas de anuncio dos clientes selecionados.",
      statusLabel:
        metaAccounts > 0
          ? `${metaAccounts} conta(s) ativa(s)`
          : metaStatus.configured
            ? "Pronto para OAuth"
            : "Configurar env",
      statusTone: metaAccounts > 0 ? "success" : metaStatus.configured ? "info" : "warning",
      action: metaStatus.configured ? (
        <Button asChild size="sm">
          <a href="/api/connectors/meta/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Meta
          </a>
        </Button>
      ) : (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Configurar env
        </Button>
      ),
    },
    {
      name: "Google Ads",
      description: context.isDemoMode
        ? "OAuth preparado com acesso offline. Em demo, o callback valida estado mas nao grava conta."
        : "Conecte o usuario/MCC, expanda a hierarquia e vincule apenas contas anunciante.",
      statusLabel:
        googleAdsAccounts > 0
          ? `${googleAdsAccounts} conta(s) ativa(s)`
          : googleAdsStatus.configured
            ? "Pronto para OAuth"
            : "Configurar env",
      statusTone:
        googleAdsAccounts > 0 ? "success" : googleAdsStatus.configured ? "info" : "warning",
      action: googleAdsStatus.configured ? (
        <Button asChild size="sm">
          <a href="/api/connectors/google-ads/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Google
          </a>
        </Button>
      ) : (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Configurar env
        </Button>
      ),
    },
    {
      name: "Shopify",
      description: context.isDemoMode
        ? "OAuth com HMAC preparado. Informe a loja quando as envs da Shopify estiverem configuradas."
        : "Conecte a loja, ingira pedidos via GraphQL e receba webhooks assinados.",
      statusLabel:
        shopifyAccounts > 0
          ? `${shopifyAccounts} loja(s) ativa(s)`
          : shopifyStatus.configured
            ? "Pronto para OAuth"
            : "Configurar env",
      statusTone:
        shopifyAccounts > 0 ? "success" : shopifyStatus.configured ? "info" : "warning",
      action: shopifyStatus.configured ? (
        <form action="/api/connectors/shopify/connect" className="flex flex-col gap-2">
          <label className="text-caption text-[var(--text-tertiary)]" htmlFor="shopify-shop">
            Loja
          </label>
          <input
            className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
            id="shopify-shop"
            name="shop"
            placeholder="loja.myshopify.com"
            required
          />
          <Button className="w-fit" size="sm" type="submit">
            <Cable size={16} aria-hidden="true" />
            Conectar Shopify
          </Button>
        </form>
      ) : (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Configurar env
        </Button>
      ),
    },
    {
      name: "Nuvemshop",
      description: context.isDemoMode
        ? "OAuth preparado. Em demo, a conexao valida estado mas nao grava loja."
        : "Conecte via OAuth, selecione a loja e sincronize pedidos e receita.",
      statusLabel:
        nuvemshopAccounts > 0
          ? `${nuvemshopAccounts} loja(s) ativa(s)`
          : nuvemshopStatus.configured
            ? "Pronto para OAuth"
            : "Configurar env",
      statusTone:
        nuvemshopAccounts > 0 ? "success" : nuvemshopStatus.configured ? "info" : "warning",
      action: nuvemshopStatus.configured ? (
        <Button asChild size="sm">
          <a href="/api/connectors/nuvemshop/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Nuvemshop
          </a>
        </Button>
      ) : (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Configurar env
        </Button>
      ),
    },
    ...manualCommerceProviders.map((provider) => {
      const definition = getConnectorDefinition(provider);
      const count = connectorCounts.get(provider) ?? 0;

      return {
        name: definition.name,
        description: context.isDemoMode
          ? "Conexao manual preparada. Em demo, as credenciais nao sao gravadas."
          : "Informe URL da loja e credenciais REST. Validamos antes de salvar.",
        statusLabel: count > 0 ? `${count} loja(s) ativa(s)` : "Credenciais manuais",
        statusTone: count > 0 ? ("success" as const) : ("warning" as const),
        action: (
          <form action="/api/connectors/manual" className="grid gap-2" method="post">
            <input name="provider" type="hidden" value={provider} />
            <label className="text-caption text-[var(--text-tertiary)]" htmlFor={`${provider}-name`}>
              Loja
            </label>
            <input
              className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
              id={`${provider}-name`}
              name="storeName"
              placeholder="Nome da loja"
              required
            />
            <label className="text-caption text-[var(--text-tertiary)]" htmlFor={`${provider}-url`}>
              URL API
            </label>
            <input
              className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
              id={`${provider}-url`}
              name="baseUrl"
              placeholder="https://loja.exemplo.com.br"
              required
            />
            <label className="text-caption text-[var(--text-tertiary)]" htmlFor={`${provider}-path`}>
              Caminho pedidos
            </label>
            <input
              className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
              id={`${provider}-path`}
              name="ordersPath"
              placeholder="/orders"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="apiUser"
                placeholder="Usuario API"
              />
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="apiPassword"
                placeholder="Senha API"
                type="password"
              />
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="apiKey"
                placeholder="API key/token"
              />
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="apiSecret"
                placeholder="API secret"
                type="password"
              />
            </div>
            <Button className="w-fit" size="sm" type="submit">
              <Cable size={16} aria-hidden="true" />
              Validar e vincular
            </Button>
          </form>
        ),
      };
    }),
  ];

  return (
    <div className="space-y-6">
      {connectedProvider && connectedProvider !== "demo" ? (
        <EventTracker
          name="connector_connect"
          properties={{ provider: connectedProvider }}
          userId={context.user.id}
          workspaceId={context.currentWorkspace.id}
        />
      ) : null}
      <div>
        <p className="text-caption text-[var(--text-tertiary)]">Conectores</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Fontes de dados</h2>
      </div>

      {message ? (
        <div
          className={cn(
            "flex gap-3 rounded-md border px-4 py-3 text-sm",
            message.tone === "success" &&
              "border-[var(--success)] bg-[var(--success-bg)] text-[var(--success)]",
            message.tone === "info" && "border-[var(--info)] bg-[var(--info-bg)] text-[var(--info)]",
            message.tone === "warning" &&
              "border-[var(--warning)] bg-[var(--warning-bg)] text-[var(--warning)]",
          )}
        >
          <CircleAlert className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">{message.title}</p>
            <p className="mt-1">{message.body}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        {providerCards.map((provider) => (
          <Card key={provider.name}>
            <CardHeader>
              <CardTitle>{provider.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-[180px] flex-col justify-between gap-5">
              <div>
                <p className="text-sm leading-6 text-[var(--text-secondary)]">
                  {provider.description}
                </p>
                <span className={cn("mt-4", statusClass(provider.statusTone))}>
                  {provider.statusLabel}
                </span>
              </div>
              <div>{provider.action}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
