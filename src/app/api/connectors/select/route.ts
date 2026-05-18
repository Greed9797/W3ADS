import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { buildConnectorBackfillEvent } from "@/lib/connectors/backfill";
import {
  loadSelectionCredentials,
  parseSelectableAccounts,
  vaultSelectedAccountCredentials,
} from "@/lib/connectors/selection";
import { prisma } from "@/lib/db/prisma";
import { inngest } from "@/lib/jobs/inngest-client";

export const runtime = "nodejs";

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
  const sessionId = String(formData.get("sessionId") ?? "");
  const selectedExternalAccountIds = formData
    .getAll("externalAccountId")
    .map((value) => String(value))
    .filter(Boolean);

  if (!sessionId || selectedExternalAccountIds.length === 0) {
    return redirectToConnectors(request, { error: "missing-selection" });
  }

  if (context.isDemoMode) {
    return redirectToConnectors(request, { connected: "demo" });
  }

  const selection = await prisma.connectorSelectionSession.findFirst({
    where: {
      id: sessionId,
      workspaceId: context.currentWorkspace.id,
      userId: context.user.id,
      status: "PENDING",
    },
  });

  if (!selection || selection.expiresAt.getTime() < Date.now()) {
    return redirectToConnectors(request, { error: "selection-expired" });
  }

  try {
    const credentials = await loadSelectionCredentials(selection);
    const accounts = parseSelectableAccounts(selection.accounts);
    const accountsById = new Map(accounts.map((account) => [account.externalAccountId, account]));
    const selected = selectedExternalAccountIds.map((id) => {
      const account = accountsById.get(id);
      if (!account) {
        throw new Error("Selected connector account was not found");
      }

      return account;
    });
    const connectorAccountIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const account of selected) {
        const credentialFields = await vaultSelectedAccountCredentials({
          workspaceId: context.currentWorkspace.id,
          provider: selection.provider,
          externalAccountId: account.externalAccountId,
          credentials,
        });
        const connectorAccount = await tx.connectorAccount.upsert({
          where: {
            workspaceId_provider_externalAccountId: {
              workspaceId: context.currentWorkspace.id,
              provider: selection.provider,
              externalAccountId: account.externalAccountId,
            },
          },
          update: {
            accountName: account.accountName,
            status: "ACTIVE",
            ...credentialFields,
            metadata: account.metadata ?? undefined,
            lastSyncError: null,
          },
          create: {
            workspaceId: context.currentWorkspace.id,
            provider: selection.provider,
            externalAccountId: account.externalAccountId,
            accountName: account.accountName,
            status: "ACTIVE",
            ...credentialFields,
            metadata: account.metadata ?? undefined,
          },
        });
        ids.push(connectorAccount.id);
      }

      await tx.connectorSelectionSession.update({
        where: { id: selection.id },
        data: {
          status: "CONSUMED",
          consumedAt: new Date(),
        },
      });

      return ids;
    });

    if (process.env.INNGEST_EVENT_KEY) {
      await Promise.all(
        connectorAccountIds.map((connectorAccountId) =>
          inngest.send(
            buildConnectorBackfillEvent({
              provider: selection.provider,
              connectorAccountId,
            }),
          ),
        ),
      );
    }

    await logAudit({
      action: "connector.selection.connect",
      userId: context.user.id,
      workspaceId: context.currentWorkspace.id,
      resourceType: "connector_selection_session",
      resourceId: selection.id,
      metadata: {
        provider: selection.provider,
        accounts: selected.length,
        backfillQueued: Boolean(process.env.INNGEST_EVENT_KEY),
      },
    });

    return redirectToConnectors(request, {
      provider: selection.provider.toLowerCase(),
      connected: selection.provider.toLowerCase(),
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "unknown";
    const error = message.includes("Secret not found") ? "selection-expired" : "selection-failed";

    return redirectToConnectors(request, { error });
  }
}
