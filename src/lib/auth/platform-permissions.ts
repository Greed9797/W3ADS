import type { MemberRole, PlatformRole } from "@prisma/client";

type PlatformUser = {
  platformRole: PlatformRole | "USER" | "W3_ADMIN" | "ADMIN_MASTER" | "ADMIN_LIMITED" | "TRAFFIC_MANAGER";
};

export function isAdminMaster(user: PlatformUser) {
  return user.platformRole === "ADMIN_MASTER" || user.platformRole === "W3_ADMIN";
}

export function isAdminLimited(user: PlatformUser) {
  return user.platformRole === "ADMIN_LIMITED";
}

export function isTrafficManager(user: PlatformUser) {
  return user.platformRole === "TRAFFIC_MANAGER";
}

export function isInternalW3User(user: PlatformUser) {
  return isAdminMaster(user) || isAdminLimited(user) || isTrafficManager(user);
}

export function canViewBrands(user: PlatformUser) {
  return isInternalW3User(user);
}

export function canManagePlatformUsers(user: PlatformUser) {
  return isAdminMaster(user) || isAdminLimited(user);
}

export function canManageAdminUsers(user: PlatformUser) {
  return isAdminMaster(user);
}

export function canManageProviderConfigs(user: PlatformUser) {
  return isAdminMaster(user) || isAdminLimited(user);
}

export function canOperateWorkspaceConnectors(user: PlatformUser, role: MemberRole) {
  if (isInternalW3User(user)) return true;

  return role === "OWNER" || role === "ADMIN";
}

export function assertCanManageProviderConfigs(user: PlatformUser) {
  if (!canManageProviderConfigs(user)) {
    throw new Error("Sem permissao para configurar provedores.");
  }
}

export function assertCanManagePlatformUsers(user: PlatformUser) {
  if (!canManagePlatformUsers(user)) {
    throw new Error("Sem permissao para gerenciar usuarios da plataforma.");
  }
}

export function assertCanManageAdminUsers(user: PlatformUser) {
  if (!canManageAdminUsers(user)) {
    throw new Error("Somente Admin Master pode gerenciar admins internos.");
  }
}

export function canAssignPlatformRole(actor: PlatformUser, targetRole: PlatformRole) {
  if (isAdminMaster(actor)) return true;

  return isAdminLimited(actor) && (targetRole === "TRAFFIC_MANAGER" || targetRole === "USER");
}

export function platformRoleLabel(role: PlatformRole) {
  const labels: Record<PlatformRole, string> = {
    USER: "Usuário",
    W3_ADMIN: "Admin Master legado",
    ADMIN_MASTER: "Admin Master",
    ADMIN_LIMITED: "Admin Limitado",
    TRAFFIC_MANAGER: "Gestor de Tráfego",
  };

  return labels[role];
}
