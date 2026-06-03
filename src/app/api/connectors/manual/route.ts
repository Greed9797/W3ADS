import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canOperateWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import {
  stableExternalAccountId,
  vaultCredentialFields,
} from "@/lib/connectors/credentials";
import { syncEcommerceOrders } from "@/lib/connectors/ecommerce-sync";
import { isInngestConfigured } from "@/lib/connectors/inngest-config";
import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";
import { normalizeManualProviderCredentials } from "@/lib/connectors/manual-commerce";
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

function redirectToConnectors(
  request: NextRequest,
  params: Record<string, string>,
) {
  const url = new URL("/connectors", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function POST(request: NextRequest) {
  const context = await getCurrentUserContext();
  const formData = await request.formData();
  const parsed = manualConnectorSchema.safeParse(
    Object.fromEntries(formData.entries()),
  );

  if (!parsed.success || !isManualCommerceProvider(parsed.data.provider)) {
    return redirectToConnectors(request, { error: "invalid-manual-connector" });
  }
  if (
    !canOperateWorkspaceConnectors(context.user, context.currentMembership.role)
  ) {
    return redirectToConnectors(request, { error: "forbidden" });
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
    const configuredCredentials =
      await publicManualCredentialsFromProviderConfig(providerConfig);
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
    const inngestActive = isInngestConfigured();
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
          syncMode: inngestActive ? "inngest" : "inline",
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
          syncMode: inngestActive ? "inngest" : "inline",
        },
      },
    });

    let inlineSyncRan = false;
    let inlineSyncError: string | null = null;

    if (inngestActive) {
      try {
        await inngest.send(
          buildConnectorBackfillEvent({
            provider: normalized.provider,
            connectorAccountId: connectorAccount.id,
          }),
        );
      } catch (err) {
        inlineSyncError =
          err instanceof Error ? err.message : "inngest_send_failed";
      }
    } else {
      // Inngest not configured (placeholder keys): run sync inline so dashboard
      // gets populated immediately. Errors get persisted via syncEcommerceOrders
      // (which writes lastSyncError) but don't fail the connect flow.
      const since = new Date();
      since.setUTCHours(0, 0, 0, 0);
      since.setUTCDate(since.getUTCDate() - 30);
      const until = new Date();
      until.setUTCHours(23, 59, 59, 999);

      try {
        await syncEcommerceOrders({
          connectorAccountId: connectorAccount.id,
          range: { since: since.toISOString(), until: until.toISOString() },
          syncType: "BACKFILL",
        });
        inlineSyncRan = true;
      } catch (err) {
        inlineSyncError =
          err instanceof Error ? err.message : "inline_sync_failed";
      }
    }

    if (inlineSyncRan) {
      await prisma.connectorAccount.update({
        where: { id: connectorAccount.id },
        data: {
          metadata: {
            credentialMode: "manual",
            providerConfigId: providerConfig.id,
            syncMode: "inline",
            inlineLastBackfillAt: new Date().toISOString(),
          },
        },
      });
    }

    await logAudit({
      action: "connector.manual.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_account",
      resourceId: connectorAccount.id,
      metadata: {
        provider: normalized.provider,
        backfillQueued: inngestActive,
        inlineSyncRan,
        inlineSyncError,
        syncMode: inngestActive ? "inngest" : "inline",
      },
    });

    return redirectToConnectors(request, {
      provider: normalized.provider.toLowerCase(),
      connected: normalized.provider.toLowerCase(),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const error = message.includes("Secret not found")
      ? "missing-provider-config"
      : "manual-credentials";

    return redirectToConnectors(request, {
      provider: parsed.data.provider.toLowerCase(),
      error,
    });
  }
}
