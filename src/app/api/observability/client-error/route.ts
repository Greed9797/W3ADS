import { NextRequest } from "next/server";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { isAuthDisabled } from "@/lib/auth/mode";
import { buildAnalyticsEvent, buildSanitizedClientError } from "@/lib/observability/analytics";

export const runtime = "nodejs";

const clientErrorSchema = z.object({
  message: z.string().min(1).max(500),
  stack: z.string().max(1800).optional(),
  path: z.string().max(200).optional(),
  digest: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  const body = clientErrorSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return Response.json({ ok: false, error: "invalid-payload" }, { status: 400 });
  }

  const error = buildSanitizedClientError(body.data);
  const metadata = {
    message: error.message,
    path: error.path,
    digest: error.digest,
    stack: error.stack,
    event: buildAnalyticsEvent({
      name: "client_error",
      userId: "anonymous",
      properties: {
        path: error.path,
      },
    }),
  };

  if (isAuthDisabled()) {
    return Response.json({ ok: true, mode: "demo" });
  }

  await logAudit({
    action: "observability.client_error",
    resourceType: "clientError",
    metadata: JSON.parse(JSON.stringify(metadata)),
  });

  return Response.json({ ok: true });
}
