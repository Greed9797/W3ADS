import { ConnectorProvider } from "@prisma/client";
import { Cable, CircleAlert, Settings } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { getMetaConfigStatus } from "@/lib/connectors/meta/oauth";
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
    "provider-denied": "A autorizacao foi cancelada na Meta.",
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
  const metaAccounts = context.isDemoMode
    ? 0
    : await prisma.connectorAccount.count({
        where: {
          workspaceId: context.currentWorkspace.id,
          provider: ConnectorProvider.META_ADS,
        },
      });

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
      description: "OAuth, GAQL e backfill entram na etapa seguinte, depois da base Meta estar validada.",
      statusLabel: "Proxima fase",
      statusTone: "warning",
      action: (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Em breve
        </Button>
      ),
    },
    {
      name: "Shopify",
      description: "OAuth com HMAC, pedidos GraphQL e webhooks ficam isolados na fase de ecommerce.",
      statusLabel: "Proxima fase",
      statusTone: "warning",
      action: (
        <Button disabled size="sm" variant="secondary">
          <Settings size={16} aria-hidden="true" />
          Em breve
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
