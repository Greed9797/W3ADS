import { ConnectorProvider } from "@prisma/client";
import { Cable, CircleAlert, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { EventTracker } from "@/components/observability/event-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import {
  canManageProviderConfigs,
  canOperateWorkspaceConnectors,
} from "@/lib/auth/platform-permissions";
import { listPublicProviderConfigs } from "@/lib/connectors/provider-config";
import {
  getConnectorDefinition,
  manualCommerceProviders,
} from "@/lib/connectors/registry";
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

  if (connected === "google-analytics") {
    return {
      tone: "success" as const,
      title: "Google Analytics conectado.",
      body: "As propriedades GA4 selecionadas foram salvas e prontas para sincronizar sessões.",
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

  if (
    connected &&
    ["iset", "tray", "wbuy", "magazord", "google_sheets"].includes(connected)
  ) {
    return {
      tone: "success" as const,
      title: connected === "google_sheets" ? "Planilha conectada." : "Loja conectada.",
      body:
        connected === "google_sheets"
          ? "A planilha foi validada em tempo real e entrara na soma de pedidos aprovados do WhatsApp."
          : "Validamos as credenciais antes de salvar e a sincronizacao de pedidos ja pode rodar.",
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
    "missing-provider-config":
      "Esse conector ainda nao foi configurado no app pela equipe W3.",
    "meta-api": "Nao conseguimos concluir a conexao com a Meta agora. Tente novamente em alguns minutos.",
    "google-ads-api":
      "Nao conseguimos concluir a conexao com o Google Ads agora. Confira o developer token e tente novamente.",
    "google-analytics-api":
      "Nao conseguimos concluir a conexao com o Google Analytics agora. Confira o OAuth e tente novamente.",
    "invalid-hmac": "A assinatura retornada pela Shopify nao passou na validacao HMAC.",
    "invalid-shop": "Informe uma loja Shopify valida, como loja.myshopify.com.",
    "provider-denied": "A autorizacao foi cancelada no provedor.",
    "missing-shop": "Informe o dominio da loja Shopify antes de conectar.",
    "shopify-api": "Nao conseguimos concluir a conexao com a Shopify agora. Tente novamente em alguns minutos.",
    "nuvemshop-api":
      "Nao conseguimos concluir a conexao com a Nuvemshop agora. Tente novamente em alguns minutos.",
    "missing-selection": "Selecione pelo menos uma conta antes de vincular.",
    "selection-expired": "A selecao expirou. Inicie a conexao novamente.",
    "selection-failed": "Nao conseguimos salvar a selecao agora. Tente novamente.",
    "invalid-manual-connector": "Revise os dados da loja e tente novamente.",
    "manual-credentials":
      "Nao conseguimos validar essas credenciais. Confira a URL, caminho de pedidos e chaves da API.",
    forbidden: "Seu papel atual permite visualizar conectores, mas nao vincular ou alterar contas.",
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
  const canConfigureProviders = canManageProviderConfigs(context.user);
  const canConnectAccounts = canOperateWorkspaceConnectors(
    context.user,
    context.currentMembership.role,
  );
  const connectorCounts = new Map<ConnectorProvider, number>();
  const providerConfigs = new Set<ConnectorProvider>();
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

    const configs = await listPublicProviderConfigs(context.currentWorkspace.id);
    for (const config of configs) {
      if (config.status === "ACTIVE") {
        providerConfigs.add(config.provider);
      }
    }
  }

  const metaAccounts = connectorCounts.get(ConnectorProvider.META_ADS) ?? 0;
  const googleAdsAccounts = connectorCounts.get(ConnectorProvider.GOOGLE_ADS) ?? 0;
  const googleAnalyticsProperties = connectorCounts.get(ConnectorProvider.GA4) ?? 0;
  const shopifyAccounts = connectorCounts.get(ConnectorProvider.SHOPIFY) ?? 0;
  const nuvemshopAccounts = connectorCounts.get(ConnectorProvider.NUVEMSHOP) ?? 0;

  function missingConfigAction(provider: ConnectorProvider) {
    if (canConfigureProviders) {
      return (
        <Button asChild size="sm" variant="secondary">
          <a href={`/connectors/settings/${provider.toLowerCase()}`}>
            <Settings size={16} aria-hidden="true" />
            Configurar no app
          </a>
        </Button>
      );
    }

    return (
      <Button disabled size="sm" variant="secondary">
        <Settings size={16} aria-hidden="true" />
        Aguardando W3
      </Button>
    );
  }

  function readOnlyAction() {
    return (
      <Button disabled size="sm" variant="secondary">
        <Cable size={16} aria-hidden="true" />
        Somente leitura
      </Button>
    );
  }

  function connectorAction(provider: ConnectorProvider, action: ReactNode) {
    if (!providerConfigs.has(provider)) return missingConfigAction(provider);
    if (!canConnectAccounts) return readOnlyAction();

    return action;
  }

  function statusLabel(provider: ConnectorProvider, count: number, unit: string) {
    if (count > 0) return `${count} ${unit}(s) ativa(s)`;
    if (providerConfigs.has(provider)) return "Pronto para conectar";

    return "Aguardando configuração W3";
  }

  function statusTone(provider: ConnectorProvider, count: number) {
    if (count > 0) return "success" as const;
    if (providerConfigs.has(provider)) return "info" as const;

    return "warning" as const;
  }

  const providerCards: ProviderCard[] = [
    {
      name: "Meta Ads",
      description: context.isDemoMode
        ? "Configure o app Meta pelo CRUD interno antes de conectar contas de anuncio."
        : "Conecte o perfil e vincule somente as contas de anuncio dos clientes selecionados.",
      statusLabel:
        statusLabel(ConnectorProvider.META_ADS, metaAccounts, "conta"),
      statusTone: statusTone(ConnectorProvider.META_ADS, metaAccounts),
      action: connectorAction(
        ConnectorProvider.META_ADS,
        <Button asChild size="sm">
          <a href="/api/connectors/meta/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Meta
          </a>
        </Button>,
      ),
    },
    {
      name: "Google Ads",
      description: context.isDemoMode
        ? "Configure OAuth e developer token pelo CRUD interno antes de conectar clientes."
        : "Conecte o usuario/MCC, expanda a hierarquia e vincule apenas contas anunciante.",
      statusLabel:
        statusLabel(ConnectorProvider.GOOGLE_ADS, googleAdsAccounts, "conta"),
      statusTone: statusTone(ConnectorProvider.GOOGLE_ADS, googleAdsAccounts),
      action: connectorAction(
        ConnectorProvider.GOOGLE_ADS,
        <Button asChild size="sm">
          <a href="/api/connectors/google-ads/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Google
          </a>
        </Button>,
      ),
    },
    {
      name: "Google Analytics",
      description: context.isDemoMode
        ? "Configure OAuth pelo CRUD interno antes de conectar propriedades GA4."
        : "Conecte o Google Analytics e vincule as propriedades GA4 dos clientes para puxar sessões.",
      statusLabel:
        statusLabel(ConnectorProvider.GA4, googleAnalyticsProperties, "propriedade"),
      statusTone: statusTone(ConnectorProvider.GA4, googleAnalyticsProperties),
      action: connectorAction(
        ConnectorProvider.GA4,
        <Button asChild size="sm">
          <a href="/api/connectors/google-analytics/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Analytics
          </a>
        </Button>,
      ),
    },
    {
      name: "Shopify",
      description: context.isDemoMode
        ? "Configure API key e secret pelo CRUD interno antes de conectar lojas."
        : "Conecte a loja, ingira pedidos via GraphQL e receba webhooks assinados.",
      statusLabel:
        statusLabel(ConnectorProvider.SHOPIFY, shopifyAccounts, "loja"),
      statusTone: statusTone(ConnectorProvider.SHOPIFY, shopifyAccounts),
      action: connectorAction(
        ConnectorProvider.SHOPIFY,
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
        </form>,
      ),
    },
    {
      name: "Nuvemshop",
      description: context.isDemoMode
        ? "Configure client ID e secret pelo CRUD interno antes de conectar lojas."
        : "Conecte via OAuth, selecione a loja e sincronize pedidos e receita.",
      statusLabel:
        statusLabel(ConnectorProvider.NUVEMSHOP, nuvemshopAccounts, "loja"),
      statusTone: statusTone(ConnectorProvider.NUVEMSHOP, nuvemshopAccounts),
      action: connectorAction(
        ConnectorProvider.NUVEMSHOP,
        <Button asChild size="sm">
          <a href="/api/connectors/nuvemshop/connect">
            <Cable size={16} aria-hidden="true" />
            Conectar Nuvemshop
          </a>
        </Button>,
      ),
    },
    ...manualCommerceProviders.map((provider) => {
      const definition = getConnectorDefinition(provider);
      const count = connectorCounts.get(provider) ?? 0;

      return {
        name: definition.name,
        description: context.isDemoMode
          ? "Configuração manual preparada no app. Em demo, nada e gravado no banco."
          : "Use a configuração W3 do workspace para validar e vincular a loja.",
        statusLabel: statusLabel(provider, count, "loja"),
        statusTone: statusTone(provider, count),
        action: connectorAction(
          provider,
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
            <Button className="w-fit" size="sm" type="submit">
              <Cable size={16} aria-hidden="true" />
              Validar e vincular
            </Button>
          </form>,
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
