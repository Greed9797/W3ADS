import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getOperationalHealth } from "@/lib/health/checks";

export const runtime = "nodejs";

export async function GET() {
  const health = await getOperationalHealth({ prisma });

  return NextResponse.json(health, {
    status: health.ok ? 200 : 503,
  });
}
