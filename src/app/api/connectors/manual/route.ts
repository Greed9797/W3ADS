import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import {
  stableExternalAccountId,
  vaultCredentialFields,
} from "@/lib/connectors/credentials";
import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";
import {
  normalizeManualProviderCredentials,
} from "@/lib/connectors/manual-commerce";
import {
  getActiveProviderConfig,
  publicManualCredentialsFromProviderConfig,
} from "@/lib/connectors/provider-config";
import { isManualCommerceProvider } from "@/lib/connectors/registry";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/jobs/inngest-client";

export const runtime = "nodejs";

const manualConnectorSchema = z.object({
  provider: z.nativeEnum(ConnectorProvider),
  storeName: z.string().min(2),
  baseUrl: z.string().optional(),
  ordersPath: z.string().optional(),
  apiKey: z.string().optional(),
  apiSecret: z.string().optional(),
  apiUser: z.string().optional(),
  apiPassword: z.string().optional(),
});

function redirectToConnectors(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/connectors", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  const formData = await request.formData();
  const parsed = manualConnectorSchema.safeParse(Object.fromEntries(formData.entries()));

  if (!parsed.success || !isManualCommerceProvider(parsed.data.provider)) {
    return redirectToConnectors(request, { error: "invalid-manual-connector" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { connected: "demo" });
  }

  try {
    const providerConfig = await getActiveProviderConfig({
      workspaceId: context.currentWorkspace.id,
      provider: parsed.data.provider,
    });
    if (!providerConfig) {
      return redirectToConnectors(request, {
        provider: parsed.data.provider.toLowerCase(),
        error: "missing-provider-config",
      });
    }
    const configuredCredentials = await publicManualCredentialsFromProviderConfig(providerConfig);
    const normalized = normalizeManualProviderCredentials({
      ...configuredCredentials,
      provider: parsed.data.provider,
      storeName: parsed.data.storeName,
    });
    const credentialPayload = {
      baseUrl: normalized.baseUrl,
      ordersPath: configuredCredentials.ordersPath,
      apiKey: normalized.apiKey,
      apiSecret: normalized.apiSecret,
      apiUser: normalized.apiUser,
      apiPassword: normalized.apiPassword,
    };

    await new ManualCommerceClient({
      provider: normalized.provider,
      credentials: credentialPayload,
    }).healthCheck();

    const externalAccountId = stableExternalAccountId(
      normalized.provider,
      `${normalized.baseUrl}:${normalized.storeName}`,
    );
    const credentialFields = await vaultCredentialFields({
      workspaceId: context.currentWorkspace.id,
      provider: normalized.provider,
      externalAccountId,
      credentials: credentialPayload,
    });
    const connectorAccount = await prisma.connectorAccount.upsert({
      where: {
        workspaceId_provider_externalAccountId: {
          workspaceId: context.currentWorkspace.id,
          provider: normalized.provider,
          externalAccountId,
        },
      },
      update: {
        accountName: normalized.storeName,
        status: ConnectorStatus.ACTIVE,
        ...credentialFields,
        metadata: {
          credentialMode: "manual",
          providerConfigId: providerConfig.id,
        },
        lastSyncError: null,
      },
      create: {
        workspaceId: context.currentWorkspace.id,
        provider: normalized.provider,
        externalAccountId,
        accountName: normalized.storeName,
        status: ConnectorStatus.ACTIVE,
        ...credentialFields,
        metadata: {
          credentialMode: "manual",
          providerConfigId: providerConfig.id,
        },
      },
    });

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send(
        buildConnectorBackfillEvent({
          provider: normalized.provider,
          connectorAccountId: connectorAccount.id,
        }),
      );
    }

    await logAudit({
      action: "connector.manual.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_account",
      resourceId: connectorAccount.id,
      metadata: {
        provider: normalized.provider,
        backfillQueued: Boolean(process.env.INNGEST_EVENT_KEY),
      },
    });

    return redirectToConnectors(request, {
      provider: normalized.provider.toLowerCase(),
      connected: normalized.provider.toLowerCase(),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const error = message.includes("Secret not found") ? "missing-provider-config" : "manual-credentials";

    return redirectToConnectors(request, { provider: parsed.data.provider.toLowerCase(), error });
  }
}
