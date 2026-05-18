import { ConnectorProvider, ConnectorStatus } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import {
  encryptConnectorCredentials,
  stableExternalAccountId,
} from "@/lib/connectors/credentials";
import { ManualCommerceClient } from "@/lib/connectors/manual-commerce-client";
import {
  normalizeManualProviderCredentials,
} from "@/lib/connectors/manual-commerce";
import { isManualCommerceProvider } from "@/lib/connectors/registry";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/jobs/inngest-client";

export const runtime = "nodejs";

const manualConnectorSchema = z.object({
  provider: z.nativeEnum(ConnectorProvider),
  storeName: z.string().min(2),
  baseUrl: z.string().min(3),
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
    const normalized = normalizeManualProviderCredentials(parsed.data);
    const credentialPayload = {
      baseUrl: normalized.baseUrl,
      ordersPath: parsed.data.ordersPath?.trim() || "/orders",
      apiKey: normalized.apiKey,
      apiSecret: normalized.apiSecret,
      apiUser: normalized.apiUser,
      apiPassword: normalized.apiPassword,
    };

    await new ManualCommerceClient({
      provider: normalized.provider,
      credentials: credentialPayload,
    }).healthCheck();

    const encrypted = encryptConnectorCredentials(credentialPayload);
    const externalAccountId = stableExternalAccountId(
      normalized.provider,
      `${normalized.baseUrl}:${normalized.storeName}`,
    );
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
        accessTokenCiphertext: encrypted.ciphertext,
        refreshTokenCiphertext: null,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        tokenExpiresAt: null,
        metadata: {
          credentialMode: "manual",
        },
        lastSyncError: null,
      },
      create: {
        workspaceId: context.currentWorkspace.id,
        provider: normalized.provider,
        externalAccountId,
        accountName: normalized.storeName,
        status: ConnectorStatus.ACTIVE,
        accessTokenCiphertext: encrypted.ciphertext,
        refreshTokenCiphertext: null,
        tokenIv: encrypted.iv,
        tokenAuthTag: encrypted.authTag,
        tokenKeyVersion: encrypted.keyVersion,
        tokenExpiresAt: null,
        metadata: {
          credentialMode: "manual",
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
    const error = message.includes("TOKEN_ENCRYPTION_KEY")
      ? "missing-token-key"
      : "manual-credentials";

    return redirectToConnectors(request, { provider: parsed.data.provider.toLowerCase(), error });
  }
}
