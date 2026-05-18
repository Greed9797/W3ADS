import type { MemberRole } from "@prisma/client";

export type WorkspaceRoleCapability =
  | "view_dashboard"
  | "edit_dashboard"
  | "manage_connectors"
  | "manage_members"
  | "manage_workspace_settings";

type WorkspaceRoleDefinition = {
  role: MemberRole;
  label: string;
  description: string;
  capabilities: WorkspaceRoleCapability[];
};

const workspaceRoleDefinitions: Record<MemberRole, WorkspaceRoleDefinition> = {
  OWNER: {
    role: "OWNER",
    label: "Owner",
    description: "Controle total do workspace, membros, conectores e ajustes.",
    capabilities: [
      "view_dashboard",
      "edit_dashboard",
      "manage_connectors",
      "manage_members",
      "manage_workspace_settings",
    ],
  },
  ADMIN: {
    role: "ADMIN",
    label: "Admin",
    description: "Opera dashboards, conectores e membros, sem alterar a titularidade.",
    capabilities: ["view_dashboard", "edit_dashboard", "manage_connectors", "manage_members"],
  },
  VIEWER: {
    role: "VIEWER",
    label: "Viewer",
    description: "Consulta dashboards e status dos conectores em modo somente leitura.",
    capabilities: ["view_dashboard"],
  },
};

type MemberRoleChangeInput = {
  actorRole: MemberRole;
  actorMembershipId: string;
  targetMembershipId: string;
  targetCurrentRole: MemberRole;
  targetNextRole: MemberRole;
};

type MemberRemovalInput = {
  actorRole: MemberRole;
  actorMembershipId: string;
  targetMembershipId: string;
  targetRole: MemberRole;
};

export function getWorkspaceRoleDefinition(role: MemberRole) {
  return workspaceRoleDefinitions[role];
}

export function getWorkspaceRoleOptions() {
  return [
    workspaceRoleDefinitions.OWNER,
    workspaceRoleDefinitions.ADMIN,
    workspaceRoleDefinitions.VIEWER,
  ];
}

function hasCapability(role: MemberRole, capability: WorkspaceRoleCapability) {
  return workspaceRoleDefinitions[role].capabilities.includes(capability);
}

export function canManageMembers(role: MemberRole) {
  return hasCapability(role, "manage_members");
}

export function assertCanManageMembers(role: MemberRole) {
  if (!canManageMembers(role)) {
    throw new Error("Sem permissao para gerenciar membros.");
  }
}

export function canEditDashboards(role: MemberRole) {
  return hasCapability(role, "edit_dashboard");
}

export function assertCanEditDashboards(role: MemberRole) {
  if (!canEditDashboards(role)) {
    throw new Error("Sem permissao para editar dashboards.");
  }
}

export function canManageConnectors(role: MemberRole) {
  return hasCapability(role, "manage_connectors");
}

export function assertCanManageConnectors(role: MemberRole) {
  if (!canManageConnectors(role)) {
    throw new Error("Sem permissao para gerenciar conectores.");
  }
}

export function canManageWorkspaceSettings(role: MemberRole) {
  return hasCapability(role, "manage_workspace_settings");
}

export function assertCanManageWorkspaceSettings(role: MemberRole) {
  if (!canManageWorkspaceSettings(role)) {
    throw new Error("Sem permissao para alterar ajustes do workspace.");
  }
}

export function canCreateWorkspace() {
  return true;
}

export function canAssignInviteRole(role: MemberRole) {
  return role === "ADMIN" || role === "VIEWER";
}

export function canChangeMemberRole(input: MemberRoleChangeInput) {
  if (!canManageMembers(input.actorRole)) return false;
  if (input.actorMembershipId === input.targetMembershipId) return false;
  if (input.targetCurrentRole === "OWNER") return false;
  if (!canAssignInviteRole(input.targetNextRole)) return false;

  return true;
}

export function assertCanChangeMemberRole(input: MemberRoleChangeInput) {
  if (!canChangeMemberRole(input)) {
    throw new Error("Sem permissao para alterar esse membro.");
  }
}

export function canRemoveMember(input: MemberRemovalInput) {
  if (!canManageMembers(input.actorRole)) return false;
  if (input.actorMembershipId === input.targetMembershipId) return false;
  if (input.targetRole === "OWNER") return false;

  return true;
}

export function assertCanRemoveMember(input: MemberRemovalInput) {
  if (!canRemoveMember(input)) {
    throw new Error("Sem permissao para remover esse membro.");
  }
}
