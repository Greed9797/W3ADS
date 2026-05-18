import {
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  PanelsTopLeft,
  PlugZap,
  UserCircle,
  Settings,
  UsersRound,
} from "lucide-react";
import Link from "next/link";

import { W3Logo } from "@/components/brand/w3-logo";
import { Button } from "@/components/ui/button";
import type { getCurrentUserContext } from "@/lib/auth/current";
import { getWorkspaceRoleDefinition } from "@/lib/auth/permissions";

import { logoutAction, switchWorkspaceAction } from "@/app/(app)/actions";

type AppContext = Awaited<ReturnType<typeof getCurrentUserContext>>;

const baseNavItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Dashboards", href: "/dashboards", icon: PanelsTopLeft },
  { label: "Conectores", href: "/connectors", icon: PlugZap },
  { label: "Membros", href: "/workspace/members", icon: UsersRound },
  { label: "Perfil", href: "/profile", icon: UserCircle },
  { label: "Feedback", href: "/feedback", icon: MessageSquareText },
  { label: "Conta e workspaces", href: "/workspace/settings", icon: Settings },
];

export function Sidebar({ context }: { context: AppContext }) {
  const navItems =
    context.user.platformRole === "W3_ADMIN"
      ? [
          ...baseNavItems,
          { label: "Config. conectores", href: "/connectors/settings", icon: Settings },
        ]
      : baseNavItems;

  return (
    <aside className="relative hidden border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:block">
      <div className="flex h-[72px] items-center border-b border-[var(--border-subtle)] px-5">
        <W3Logo />
      </div>
      <div className="border-b border-[var(--border-subtle)] p-5">
        <p className="text-caption text-[var(--text-tertiary)]">Workspace</p>
        <form action={switchWorkspaceAction} className="mt-2">
          <select
            className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--w3-red)] focus:ring-[3px] focus:ring-[var(--w3-red-bg)]"
            defaultValue={context.currentWorkspace.id}
            name="workspaceId"
          >
            {context.memberships.map((membership) => (
              <option key={membership.workspaceId} value={membership.workspaceId}>
                {membership.workspace.name} · {getWorkspaceRoleDefinition(membership.role).label}
              </option>
            ))}
          </select>
          <Button className="mt-2 w-full" type="submit" variant="secondary" size="sm">
            Trocar workspace
          </Button>
        </form>
      </div>
      <nav className="space-y-8 p-5">
        <div className="space-y-2">
          <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Operacao
          </p>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  className="flex items-center gap-3 border-l-[3px] border-transparent px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]"
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
      {context.isDemoMode ? null : (
        <form action={logoutAction} className="absolute bottom-5 hidden px-5 lg:block">
          <Button type="submit" variant="ghost">
            <LogOut aria-hidden className="size-4" />
            Sair
          </Button>
        </form>
      )}
    </aside>
  );
}
