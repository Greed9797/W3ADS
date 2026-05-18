import { NextResponse } from "next/server";

import { isAuthDisabled } from "@/lib/auth/mode";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "adstart-w3",
    timestamp: new Date().toISOString(),
    authDisabled: isAuthDisabled(),
  });
}
