import { ConnectorProvider } from "@prisma/client";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canManageProviderConfigs } from "@/lib/auth/platform-permissions";
import {
  getProviderConfig,
  publicProviderConfig,
  type PublicProviderConfig,
} from "@/lib/connectors/provider-config";
import { getConnectorDefinition, isManualCommerceProvider } from "@/lib/connectors/registry";
import { prisma } from "@/lib/db/prisma";

import {
  deleteProviderConfigAction,
  saveProviderConfigAction,
  validateProviderConfigAction,
} from "../actions";

type ProviderConfigPageProps = {
  params: Promise<{ provider: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function providerFromParam(value: string) {
  return Object.values(ConnectorProvider).find((provider) => provider.toLowerCase() === value);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function inputClass() {
  return "h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--w3-red)] focus:ring-[3px] focus:ring-[var(--w3-red-bg)]";
}

function Field({
  name,
  label,
  type = "text",
  defaultValue,
  placeholder,
  required = false,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-caption text-[var(--text-tertiary)]">{label}</span>
      <input
        className={inputClass()}
        defaultValue={defaultValue ?? ""}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function publicCredential(config: PublicProviderConfig | null, key: string) {
  return config?.publicCredentials[key] ?? "";
}

function hasSecret(config: PublicProviderConfig | null, key: string) {
  return config?.configuredSecretKeys.includes(key) ?? false;
}

function SecretField({ name, label, configured }: { name: string; label: string; configured: boolean }) {
  return (
    <label className="grid gap-2">
      <span className="text-caption text-[var(--text-tertiary)]">{label}</span>
      <input
        className={inputClass()}
        name={name}
        placeholder={configured ? "Já configurado. Preencha só para trocar." : "Obrigatório"}
        type="password"
      />
    </label>
  );
}

function ProviderSpecificFields({
  provider,
  config,
}: {
  provider: ConnectorProvider;
  config: PublicProviderConfig | null;
}) {
  if (provider === ConnectorProvider.META_ADS) {
    return (
      <>
        <Field name="appId" label="Meta App ID" defaultValue={publicCredential(config, "appId")} required />
        <SecretField name="appSecret" label="Meta App Secret" configured={hasSecret(config, "appSecret")} />
        <Field name="apiVersion" label="API version" defaultValue={config?.apiVersion ?? "v25.0"} />
        <Field name="redirectUri" label="Redirect URI" defaultValue={config?.redirectUri} required />
        <Field
          name="scopes"
          label="Scopes"
          defaultValue={config?.scopes ?? "ads_read,ads_management,business_management,read_insights"}
        />
      </>
    );
  }

  if (provider === ConnectorProvider.GOOGLE_ADS) {
    return (
      <>
        <Field name="clientId" label="Google OAuth Client ID" defaultValue={publicCredential(config, "clientId")} required />
        <SecretField name="clientSecret" label="Google OAuth Client Secret" configured={hasSecret(config, "clientSecret")} />
        <SecretField name="developerToken" label="Google Ads Developer Token" configured={hasSecret(config, "developerToken")} />
        <Field name="apiVersion" label="API version" defaultValue={config?.apiVersion ?? "v24"} />
        <Field name="redirectUri" label="Redirect URI" defaultValue={config?.redirectUri} required />
        <Field
          name="loginCustomerId"
          label="Login Customer ID padrão"
          defaultValue={publicCredential(config, "loginCustomerId")}
          placeholder="Opcional"
        />
      </>
    );
  }

  if (provider === ConnectorProvider.GA4) {
    return (
      <>
        <Field name="clientId" label="Google OAuth Client ID" defaultValue={publicCredential(config, "clientId")} required />
        <SecretField name="clientSecret" label="Google OAuth Client Secret" configured={hasSecret(config, "clientSecret")} />
        <Field name="redirectUri" label="Redirect URI" defaultValue={config?.redirectUri} required />
        <Field
          name="scopes"
          label="Scopes"
          defaultValue={config?.scopes ?? "https://www.googleapis.com/auth/analytics.readonly"}
        />
      </>
    );
  }

  if (provider === ConnectorProvider.SHOPIFY) {
    return (
      <>
        <Field name="apiKey" label="Shopify API Key" defaultValue={publicCredential(config, "apiKey")} required />
        <SecretField name="apiSecret" label="Shopify API Secret / Webhook Secret" configured={hasSecret(config, "apiSecret")} />
        <Field name="apiVersion" label="API version" defaultValue={config?.apiVersion ?? "2026-04"} />
        <Field name="redirectUri" label="Redirect URI" defaultValue={config?.redirectUri} required />
        <Field
          name="scopes"
          label="Scopes"
          defaultValue={config?.scopes ?? "read_orders,read_products,read_customers,read_analytics"}
        />
      </>
    );
  }

  if (provider === ConnectorProvider.NUVEMSHOP) {
    return (
      <>
        <Field name="clientId" label="Nuvemshop Client ID" defaultValue={publicCredential(config, "clientId")} required />
        <SecretField name="clientSecret" label="Nuvemshop Client Secret" configured={hasSecret(config, "clientSecret")} />
        <Field name="redirectUri" label="Redirect URI" defaultValue={config?.redirectUri} required />
        <Field name="baseUrl" label="Base URL API" defaultValue={config?.baseUrl ?? "https://api.tiendanube.com/v1"} />
      </>
    );
  }

  if (isManualCommerceProvider(provider)) {
    if (provider === ConnectorProvider.GOOGLE_SHEETS) {
      return (
        <>
          <Field
            name="baseUrl"
            label="URL da planilha Google"
            defaultValue={config?.baseUrl}
            placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=..."
            required
          />
          <Field
            name="ordersPath"
            label="GID da aba"
            defaultValue={config?.ordersPath}
            placeholder="Opcional se a URL ja tiver gid"
          />
        </>
      );
    }

    return (
      <>
        <Field name="baseUrl" label="URL base da API" defaultValue={config?.baseUrl} required />
        <Field name="ordersPath" label="Caminho de pedidos" defaultValue={config?.ordersPath ?? "/orders"} />
        <SecretField name="apiUser" label="Usuário API" configured={hasSecret(config, "apiUser")} />
        <SecretField name="apiPassword" label="Senha API" configured={hasSecret(config, "apiPassword")} />
        <SecretField name="apiKey" label="API key / token" configured={hasSecret(config, "apiKey")} />
        <SecretField name="apiSecret" label="API secret" configured={hasSecret(config, "apiSecret")} />
      </>
    );
  }

  return null;
}

export default async function ConnectorProviderSettingsPage({
  params,
  searchParams,
}: ProviderConfigPageProps) {
  const context = await getCurrentUserContext();
  if (!canManageProviderConfigs(context.user)) {
    const existingAdmins = context.isDemoMode
      ? 0
      : await prisma.user.count({ where: { platformRole: { in: ["ADMIN_MASTER", "W3_ADMIN"] } } });
    if (existingAdmins === 0) {
      redirect("/platform/bootstrap");
    }

    redirect("/connectors");
  }

  const { provider: providerParam } = await params;
  const provider = providerFromParam(providerParam);
  if (!provider) {
    notFound();
  }

  const rawConfig = context.isDemoMode
    ? null
    : await getProviderConfig({
        workspaceId: context.currentWorkspace.id,
        provider,
      });
  const config = rawConfig ? publicProviderConfig(rawConfig) : null;
  const definition = getConnectorDefinition(provider);
  const query = await searchParams;
  const error = firstParam(query.error);
  const saved = firstParam(query.saved);
  const validated = firstParam(query.validated);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Configuração do conector</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{definition.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            Os campos sensíveis são gravados no Vault e nunca são renderizados de volta no app.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/connectors/settings">Todos os provedores</Link>
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-[var(--warning)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
          {error}
        </div>
      ) : null}
      {saved || validated ? (
        <div className="rounded-md border border-[var(--success)] bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Configuração validada.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados do app/API</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" action={saveProviderConfigAction}>
            <input type="hidden" name="provider" value={provider} />
            <Field name="displayName" label="Nome interno" defaultValue={config?.displayName ?? definition.name} />
            <label className="grid gap-2">
              <span className="text-caption text-[var(--text-tertiary)]">Status</span>
              <select className={inputClass()} name="status" defaultValue={config?.status ?? "ACTIVE"}>
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </label>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProviderSpecificFields provider={provider} config={config} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="submit">Salvar configuração</Button>
              <Button formAction={validateProviderConfigAction} type="submit" variant="secondary">
                Validar campos
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {config ? (
        <form action={deleteProviderConfigAction}>
          <input type="hidden" name="provider" value={provider} />
          <Button type="submit" variant="destructive">
            <Trash2 size={16} aria-hidden />
            Remover configuração
          </Button>
        </form>
      ) : null}
    </div>
  );
}
