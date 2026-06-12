import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canDeleteWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { prisma } from "@/lib/db/prisma";
import { getSecretStore } from "@/lib/security/secret-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const userContext = await getCurrentUserContext();

  if (
    !canDeleteWorkspaceConnectors(
      userContext.user,
      userContext.currentMembership.role,
    )
  ) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  const account = await prisma.connectorAccount.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      provider: true,
      accountName: true,
      credentialSecretId: true,
      refreshCredentialSecretId: true,
    },
  });

  if (!account) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  // The connected-accounts table only lists the active workspace, so a removal
  // always targets a connector in the workspace the user is currently viewing.
  if (account.workspaceId !== userContext.currentWorkspace.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  // Best-effort: drop the Vault secrets first. A Vault failure must NOT block
  // removing the connector row, so failures here are logged and swallowed.
  const store = getSecretStore();
  const secretIds = [
    account.credentialSecretId,
    account.refreshCredentialSecretId,
  ].filter((value): value is string => Boolean(value));
  for (const secretId of secretIds) {
    try {
      await store.deleteSecret(secretId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown";
      console.error(
        `[connectors/${id}] vault secret cleanup failed (${secretId}): ${message}`,
      );
    }
  }

  try {
    // FKs to ConnectorAccount are ON DELETE CASCADE (orders, daily metrics,
    // sync jobs), so this hard delete also clears the connector's child data.
    await prisma.connectorAccount.delete({ where: { id: account.id } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown";
    // Log the raw cause server-side; never return Prisma internals (table /
    // column / constraint names) to the client.
    console.error(`[connectors/${id}] delete failed: ${message}`);
    return NextResponse.json(
      {
        ok: false,
        error: "delete_failed",
        message: "Erro ao remover conector. Tente novamente.",
      },
      { status: 500 },
    );
  }

  await logAudit({
    action: "connector.removed",
    userId: userContext.user.id,
    workspaceId: account.workspaceId,
    resourceType: "connector_account",
    resourceId: account.id,
    metadata: {
      provider: account.provider,
      accountName: account.accountName,
    },
  });

  return NextResponse.json({ ok: true });
}
