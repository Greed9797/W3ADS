import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "adstart-w3",
    timestamp: new Date().toISOString(),
    authDisabled: process.env.AUTH_DISABLED !== "false",
  });
}
