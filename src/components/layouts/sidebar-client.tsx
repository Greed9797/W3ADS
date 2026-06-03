"use client";

import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PanelsTopLeft,
  PlugZap,
  Settings,
  UserCircle,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { W3Logo } from "@/components/brand/w3-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const SIDEBAR_STORAGE_KEY = "w3ads.sidebar.collapsed";

export type SidebarIconKey =
  | "dashboard"
  | "brands"
  | "users"
  | "connectors"
  | "profile"
  | "help"
  | "settings";

export type SidebarNavItem = {
  label: string;
  href: string;
  icon: SidebarIconKey;
};

export type SidebarWorkspaceOption = {
  id: string;
  name: string;
  label: string;
};

type SidebarClientProps = {
  navItems: SidebarNavItem[];
  workspaces: SidebarWorkspaceOption[];
  currentWorkspace: {
    id: string;
    name: string;
  };
  currentRoleLabel: string;
  isClientRole: boolean;
  switchWorkspaceAction: (formData: FormData) => void | Promise<void>;
  logoutAction: () => void | Promise<void>;
};

const iconMap: Record<SidebarIconKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  brands: PanelsTopLeft,
  users: UsersRound,
  connectors: PlugZap,
  profile: UserCircle,
  help: HelpCircle,
  settings: Settings,
};

function readCollapsedPreference() {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // The sidebar still works if storage is unavailable.
  }
}

export function SidebarClient({
  currentRoleLabel,
  currentWorkspace,
  isClientRole,
  logoutAction,
  navItems,
  switchWorkspaceAction,
  workspaces,
}: SidebarClientProps) {
  const [collapsed, setCollapsed] = useState(false);
  const workspaceInitial =
    currentWorkspace.name.trim().charAt(0).toUpperCase() || "W";

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      writeCollapsedPreference(next);
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "relative hidden min-h-screen shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[width] duration-200 ease-out lg:flex lg:flex-col",
        collapsed ? "w-[76px]" : "w-60",
      )}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <div
        className={cn(
          "relative flex h-[72px] items-center border-b border-[var(--border-subtle)]",
          collapsed ? "justify-center px-3" : "px-5",
        )}
      >
        {collapsed ? (
          <Link
            aria-label="Grupo W3 Ads"
            className="grid size-8 place-items-center rounded-sm bg-[var(--w3-red)]"
            href="/"
          >
            <span className="font-sans text-[0.68rem] font-black leading-none text-white">
              W3
            </span>
          </Link>
        ) : (
          <W3Logo />
        )}
        <Button
          aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
          className={cn(
            "size-8",
            collapsed
              ? "absolute -right-4 top-5 border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm"
              : "ml-auto",
          )}
          onClick={toggleCollapsed}
          size="icon"
          title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
          type="button"
          variant="ghost"
        >
          {collapsed ? (
            <ChevronRight aria-hidden className="size-4" />
          ) : (
            <ChevronLeft aria-hidden className="size-4" />
          )}
        </Button>
      </div>

      {collapsed ? (
        <div className="grid place-items-center border-b border-[var(--border-subtle)] px-3 py-4">
          <div
            className="grid size-10 place-items-center rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)]"
            title={`${currentWorkspace.name} · ${currentRoleLabel}`}
          >
            {workspaceInitial}
          </div>
        </div>
      ) : (
        <div className="border-b border-[var(--border-subtle)] p-5">
          <p className="text-caption text-[var(--text-tertiary)]">Workspace</p>
          {isClientRole ? (
            <div className="mt-2 rounded-md border border-[var(--border-strong)] px-3 py-2 text-sm font-medium text-[var(--text-primary)]">
              {currentWorkspace.name} · Cliente
            </div>
          ) : (
            <form action={switchWorkspaceAction} className="mt-2">
              <select
                className="h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--w3-red)] focus:ring-[3px] focus:ring-[var(--w3-red-bg)]"
                defaultValue={currentWorkspace.id}
                name="workspaceId"
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.label}
                  </option>
                ))}
              </select>
              <Button
                className="mt-2 w-full"
                type="submit"
                variant="secondary"
                size="sm"
              >
                Trocar workspace
              </Button>
            </form>
          )}
        </div>
      )}

      <nav className={cn("flex-1 space-y-8", collapsed ? "p-3" : "p-5")}>
        <div className="space-y-2">
          {collapsed ? null : (
            <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Operacao
            </p>
          )}
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = iconMap[item.icon];

              return (
                <Link
                  aria-label={item.label}
                  className={cn(
                    "flex items-center border-l-[3px] border-transparent py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)]",
                    collapsed
                      ? "justify-center px-0"
                      : "gap-3 px-3",
                  )}
                  href={item.href}
                  key={item.href}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />
                  {collapsed ? null : <span>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      <form
        action={logoutAction}
        className={cn("pb-5", collapsed ? "px-3" : "px-5")}
      >
        <Button
          aria-label="Sair"
          className={cn(collapsed ? "w-full px-0" : undefined)}
          size={collapsed ? "icon" : "md"}
          title="Sair"
          type="submit"
          variant="ghost"
        >
          <LogOut aria-hidden className="size-4" />
          {collapsed ? null : "Sair"}
        </Button>
      </form>
    </aside>
  );
}
