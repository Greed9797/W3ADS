import { ConnectorProvider } from "@prisma/client";
import { Cable, CircleAlert, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { getGoogleAdsConfigStatus } from "@/lib/connectors/google-ads/oauth";
import { getMetaConfigStatus } from "@/lib/connectors/meta/oauth";
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
  const message = connectorMessage(firstParam(params.error), firstParam(params.connected));
  const metaStatus = getMetaConfigStatus();
  const googleAdsStatus = getGoogleAdsConfigStatus();
  const shopifyStatus = getShopifyConfigStatus();
  const [metaAccounts, googleAdsAccounts, shopifyAccounts] = context.isDemoMode
    ? [0, 0, 0]
    : await Promise.all([
        prisma.connectorAccount.count({
          where: {
            workspaceId: context.currentWorkspace.id,
            provider: ConnectorProvider.META_ADS,
          },
        }),
        prisma.connectorAccount.count({
          where: {
            workspaceId: context.currentWorkspace.id,
            provider: ConnectorProvider.GOOGLE_ADS,
          },
        }),
        prisma.connectorAccount.count({
          where: {
            workspaceId: context.currentWorkspace.id,
            provider: ConnectorProvider.SHOPIFY,
          },
        }),
      ]);

  const providerCards: ProviderCard[] = [
    {
      name: "Meta Ads",
      description: context.isDemoMode
        ? "OAuth preparado. Com AUTH_DISABLED=true, o callback valida estado mas nao grava token."
        : "Conecte contas de anuncio, salve tokens criptografados e prepare o backfill de 90 dias.",
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
        : "Conecte customers acessiveis, salve refresh token criptografado e sincronize via GAQL.",
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
  ];

  return (
    <div className="space-y-6">
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

      <div className="grid gap-4 md:grid-cols-3">
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
