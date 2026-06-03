import { NextResponse, type NextRequest } from "next/server";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canAddWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { SYNC_HELPERS } from "@/lib/connectors/sync-helpers";
import { computeForegroundRange } from "@/lib/connectors/sync-range";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const userContext = await getCurrentUserContext();

  if (
    !canAddWorkspaceConnectors(
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
    },
  });

  if (!account) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  if (account.workspaceId !== userContext.currentWorkspace.id) {
    return NextResponse.json(
      { ok: false, error: "forbidden" },
      { status: 403 },
    );
  }

  const helper = SYNC_HELPERS[account.provider as keyof typeof SYNC_HELPERS];

  if (!helper) {
    return NextResponse.json(
      {
        ok: false,
        error: "unsupported_provider",
        message: `Sync inline ainda não suportado para ${account.provider}.`,
      },
      { status: 400 },
    );
  }

  // Manual button only runs the foreground window (current UTC month →
  // today). Historical backfill happens incrementally in the background
  // via the workspace orchestrator (login SWR + daily cron).
  const range = computeForegroundRange();
  const start = Date.now();

  try {
    await helper({
      connectorAccountId: account.id,
      range,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro desconhecido ao sincronizar.";

    try {
      await prisma.connectorAccount.update({
        where: { id: account.id },
        data: {
          status: "ERROR",
          lastSyncError: message,
          lastSyncedAt: new Date(),
        },
      });
    } catch {
      // Defensive: ignore DB update failure so we still return a response.
    }

    await logAudit({
      action: "connector.manual.connect",
      userId: userContext.user.id,
      workspaceId: userContext.currentWorkspace.id,
      resourceType: "connector_account",
      resourceId: account.id,
      metadata: {
        manualSync: true,
        syncMode: "manual",
        provider: account.provider,
        ok: false,
        error: message,
      },
    });
    return NextResponse.json(
      { ok: false, error: "sync_failed", message },
      { status: 500 },
    );
  }

  const durationMs = Date.now() - start;

  await logAudit({
    action: "connector.manual.connect",
    userId: userContext.user.id,
    workspaceId: userContext.currentWorkspace.id,
    resourceType: "connector_account",
    resourceId: account.id,
    metadata: {
      manualSync: true,
      syncMode: "manual",
      provider: account.provider,
      ok: true,
      durationMs,
    },
  });

  return NextResponse.json({ ok: true, durationMs });
}
