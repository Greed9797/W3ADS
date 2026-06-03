import { NextResponse, type NextRequest } from "next/server";
import { ConnectorStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  BACKGROUND_THRESHOLD_MS,
  triggerWorkspaceSyncIfStale,
} from "@/lib/workspace/sync-orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_not_configured" },
      { status: 503 },
    );
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const cutoff = new Date(Date.now() - BACKGROUND_THRESHOLD_MS);

  const stale = await prisma.workspace.findMany({
    where: {
      connectors: { some: { status: ConnectorStatus.ACTIVE } },
      OR: [
        { syncState: null },
        { syncState: { lastSyncedAt: { lt: cutoff } } },
        { syncState: { lastSyncedAt: null } },
      ],
    },
    select: { id: true },
    take: BATCH_SIZE,
  });

  const outcomes: Array<{ workspaceId: string; outcome: string }> = [];
  for (const workspace of stale) {
    const result = await triggerWorkspaceSyncIfStale({
      workspaceId: workspace.id,
      triggeredBy: "cron",
      thresholdMs: BACKGROUND_THRESHOLD_MS,
    });
    outcomes.push({
      workspaceId: workspace.id,
      outcome: `${result.triggered ? "triggered" : "skipped"}:${result.reason}`,
    });
  }

  return NextResponse.json({
    ok: true,
    candidates: stale.length,
    outcomes,
  });
}
