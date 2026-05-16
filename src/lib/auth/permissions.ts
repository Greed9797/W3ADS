import type { MemberRole } from "@prisma/client";

const editableRoles = new Set<MemberRole>(["OWNER", "ADMIN"]);

export function canManageMembers(role: MemberRole) {
  return editableRoles.has(role);
}

export function assertCanManageMembers(role: MemberRole) {
  if (!canManageMembers(role)) {
    throw new Error("Sem permissao para gerenciar membros.");
  }
}

export function canEditDashboards(role: MemberRole) {
  return editableRoles.has(role);
}

export function assertCanEditDashboards(role: MemberRole) {
  if (!canEditDashboards(role)) {
    throw new Error("Sem permissao para editar dashboards.");
  }
}
