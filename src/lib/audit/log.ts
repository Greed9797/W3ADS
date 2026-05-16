import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type AuditAction =
  | "auth.signup"
  | "auth.login"
  | "auth.logout"
  | "auth.password_reset.request"
  | "auth.password_reset.complete"
  | "connector.google_ads.connect"
  | "connector.meta.connect"
  | "connector.shopify.connect"
  | "connector.shopify.uninstall"
  | "lgpd.data_export.request"
  | "lgpd.delete_account.request"
  | "workspace.member.invite"
  | "workspace.switch";

type LogAuditInput = {
  action: AuditAction;
  userId?: string;
  workspaceId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ip?: string;
  userAgent?: string;
};

export async function logAudit(input: LogAuditInput) {
  await prisma.auditLog.create({
    data: {
      action: input.action,
      userId: input.userId,
      workspaceId: input.workspaceId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
      ip: input.ip,
      userAgent: input.userAgent,
    },
  });
}
