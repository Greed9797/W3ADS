import type { getCurrentUserContext } from "@/lib/auth/current";
import {
  canManageMembers,
  canManageWorkspaceSettings,
  getWorkspaceRoleDefinition,
} from "@/lib/auth/permissions";
import {
  canAddWorkspaceConnectors,
  canManagePlatformUsers,
  canManageProviderConfigs,
  canViewBrands,
} from "@/lib/auth/platform-permissions";

import { logoutAction, switchWorkspaceAction } from "@/app/(app)/actions";

import {
  SidebarClient,
  type SidebarNavItem,
  type SidebarWorkspaceOption,
} from "./sidebar-client";

type AppContext = Awaited<ReturnType<typeof getCurrentUserContext>>;

export function Sidebar({ context }: { context: AppContext }) {
  const navItems: SidebarNavItem[] = [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    ...(canViewBrands(context.user)
      ? [{ label: "Marcas", href: "/dashboards", icon: "brands" as const }]
      : []),
    ...(canManagePlatformUsers(context.user)
      ? [
          {
            label: "Usuários",
            href: "/platform/users",
            icon: "users" as const,
          },
        ]
      : []),
    ...(canAddWorkspaceConnectors(context.user, context.currentMembership.role)
      ? [
          {
            label: "Conectores",
            href: "/connectors",
            icon: "connectors" as const,
          },
        ]
      : []),
    ...(canManageMembers(context.currentMembership.role)
      ? [
          {
            label: "Membros",
            href: "/workspace/members",
            icon: "users" as const,
          },
        ]
      : []),
    { label: "Perfil", href: "/profile", icon: "profile" },
    { label: "FAQ / Ajuda", href: "/faq", icon: "help" },
    ...(canManageWorkspaceSettings(context.currentMembership.role)
      ? [
          {
            label: "Conta e workspaces",
            href: "/workspace/settings",
            icon: "settings" as const,
          },
        ]
      : []),
    ...(canManageProviderConfigs(context.user)
      ? [
          {
            label: "Config. conectores",
            href: "/connectors/settings",
            icon: "settings" as const,
          },
        ]
      : []),
  ];
  const workspaces: SidebarWorkspaceOption[] = context.memberships.map(
    (membership) => ({
      id: membership.workspaceId,
      name: membership.workspace.name,
      label: `${membership.workspace.name} · ${
        getWorkspaceRoleDefinition(membership.role).label
      }`,
    }),
  );

  return (
    <SidebarClient
      currentRoleLabel={
        getWorkspaceRoleDefinition(context.currentMembership.role).label
      }
      currentWorkspace={{
        id: context.currentWorkspace.id,
        name: context.currentWorkspace.name,
      }}
      isClientRole={context.currentMembership.role === "CLIENT"}
      logoutAction={logoutAction}
      navItems={navItems}
      switchWorkspaceAction={switchWorkspaceAction}
      workspaces={workspaces}
    />
  );
}
