"use server";

import { ConnectorProvider } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { assertCanManageProviderConfigs } from "@/lib/auth/platform-permissions";
import {
  getProviderConfig,
  parseSecretRefs,
  upsertConnectorProviderConfig,
  validateProviderConfigInput,
  type ProviderConfigInput,
} from "@/lib/connectors/provider-config";
import { isManualCommerceProvider } from "@/lib/connectors/registry";
import { getSecretStore } from "@/lib/security/secret-store";
import { prisma } from "@/lib/db/prisma";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function getProvider(value: string) {
  if (!Object.values(ConnectorProvider).includes(value as ConnectorProvider)) {
    throw new Error("Provedor inválido.");
  }

  return value as ConnectorProvider;
}

function providerConfigFromFormData(formData: FormData): ProviderConfigInput {
  const provider = getProvider(getString(formData, "provider"));
  const publicCredentials: Record<string, string> = {};
  const secrets: Record<string, string> = {};

  for (const key of ["appId", "clientId", "apiKey", "loginCustomerId"]) {
    const value = getString(formData, key);
    if (value) publicCredentials[key] = value;
  }

  for (const key of ["appSecret", "clientSecret", "developerToken", "apiSecret", "apiUser", "apiPassword"]) {
    const value = getString(formData, key);
    if (value) secrets[key] = value;
  }

  return {
    provider,
    status: getString(formData, "status") === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    redirectUri: getString(formData, "redirectUri") || null,
    scopes: getString(formData, "scopes") || null,
    apiVersion: getString(formData, "apiVersion") || null,
    baseUrl: getString(formData, "baseUrl") || null,
    ordersPath: getString(formData, "ordersPath") || null,
    displayName: getString(formData, "displayName") || null,
    publicCredentials,
    secrets,
  };
}

export async function saveProviderConfigAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageProviderConfigs(context.user);
  const config = providerConfigFromFormData(formData);
  const redirectPath = `/connectors/settings/${config.provider.toLowerCase()}`;

  if (context.isDemoMode) {
    redirect(`${redirectPath}?saved=demo`);
  }

  try {
    await upsertConnectorProviderConfig({
      workspaceId: context.currentWorkspace.id,
      actorUserId: context.user.id,
      config,
    });

    await logAudit({
      action: "connector.provider_config.update",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_provider_config",
      resourceId: config.provider,
      metadata: { provider: config.provider },
    });

    revalidatePath("/connectors");
    revalidatePath("/connectors/settings");
    redirect(`${redirectPath}?saved=1`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao salvar configuração.";
    redirect(`${redirectPath}?error=${encodeURIComponent(message)}`);
  }
}

export async function validateProviderConfigAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageProviderConfigs(context.user);
  const config = providerConfigFromFormData(formData);
  const existing = context.isDemoMode
    ? null
    : await getProviderConfig({
        workspaceId: context.currentWorkspace.id,
        provider: config.provider,
      });
  const validation = validateProviderConfigInput({
    ...config,
    existingSecretRefs: parseSecretRefs(existing?.secretRefs),
  });
  const redirectPath = `/connectors/settings/${config.provider.toLowerCase()}`;

  if (!validation.success) {
    redirect(`${redirectPath}?error=${encodeURIComponent(validation.error)}`);
  }

  if (context.isDemoMode) {
    redirect(`${redirectPath}?validated=demo`);
  }

  await logAudit({
    action: "connector.provider_config.validate",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "connector_provider_config",
    resourceId: config.provider,
    metadata: {
      provider: config.provider,
      manualProvider: isManualCommerceProvider(config.provider),
    },
  });

  redirect(`${redirectPath}?validated=1`);
}

export async function deleteProviderConfigAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageProviderConfigs(context.user);
  const provider = getProvider(getString(formData, "provider"));

  if (context.isDemoMode) {
    redirect("/connectors/settings?deleted=demo");
  }

  const existing = await prisma.connectorProviderConfig.findUnique({
    where: {
      workspaceId_provider: {
        workspaceId: context.currentWorkspace.id,
        provider,
      },
    },
  });
  const store = getSecretStore();

  for (const secretId of Object.values(parseSecretRefs(existing?.secretRefs))) {
    await store.deleteSecret(secretId);
  }

  await prisma.connectorProviderConfig.deleteMany({
    where: {
      workspaceId: context.currentWorkspace.id,
      provider,
    },
  });
  await logAudit({
    action: "connector.provider_config.delete",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "connector_provider_config",
    resourceId: provider,
    metadata: { provider },
  });

  revalidatePath("/connectors");
  revalidatePath("/connectors/settings");
  redirect("/connectors/settings?deleted=1");
}
