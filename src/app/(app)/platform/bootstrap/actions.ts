"use server";

import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import { prisma } from "@/lib/db/prisma";

export async function bootstrapW3AdminAction() {
  const context = await getCurrentUserContext();

  if (context.isDemoMode) {
    redirect("/connectors/settings?bootstrapped=demo");
  }

  const existingAdmins = await prisma.user.count({
    where: { platformRole: "W3_ADMIN" },
  });

  if (existingAdmins > 0) {
    redirect("/connectors");
  }

  await prisma.user.update({
    where: { id: context.user.id },
    data: { platformRole: "W3_ADMIN" },
  });

  await logAudit({
    action: "connector.provider_config.update",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "user",
    resourceId: context.user.id,
    metadata: { bootstrap: "W3_ADMIN" },
  });

  redirect("/connectors/settings?bootstrapped=1");
}
