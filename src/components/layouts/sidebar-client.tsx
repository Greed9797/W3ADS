"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  PanelsTopLeft,
  PlugZap,
  Settings,
  UnfoldVertical,
  UserCircle,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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

export type SidebarSection = "overview" | "manage" | "account";

export type SidebarNavItem = {
  label: string;
  href: string;
  icon: SidebarIconKey;
  section: SidebarSection;
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
  userName: string | null;
  userEmail: string;
  userImage: string | null;
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

const SECTIONS: { key: SidebarSection; label: string }[] = [
  { key: "overview", label: "Visão geral" },
  { key: "manage", label: "Gerenciar" },
  { key: "account", label: "Conta" },
];

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

function getInitials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Resolve the single nav item that matches the current pathname, preferring the
 * longest href so nested routes (e.g. /connectors/settings) win over their
 * parent (/connectors).
 */
function resolveActiveHref(navItems: SidebarNavItem[], pathname: string) {
  return navItems
    .filter(
      (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function Avatar({
  name,
  email,
  image,
  className,
}: {
  name: string | null;
  email: string;
  image: string | null;
  className?: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt={name ?? email}
        className={cn(
          "shrink-0 rounded-full object-cover",
          className ?? "size-9",
        )}
        src={image}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)]",
        className ?? "size-9",
      )}
    >
      {getInitials(name, email)}
    </span>
  );
}

export function SidebarClient({
  currentRoleLabel,
  currentWorkspace,
  isClientRole,
  logoutAction,
  navItems,
  switchWorkspaceAction,
  userEmail,
  userImage,
  userName,
  workspaces,
}: SidebarClientProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname() ?? "";
  const activeHref = resolveActiveHref(navItems, pathname);
  const workspaceInitial =
    currentWorkspace.name.trim().charAt(0).toUpperCase() || "W";
  const displayName = userName?.trim() || userEmail.split("@")[0];

  useEffect(() => {
    setCollapsed(readCollapsedPreference());
  }, []);

  useEffect(() => {
    if (!workspaceMenuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (
        workspaceMenuRef.current &&
        !workspaceMenuRef.current.contains(event.target as Node)
      ) {
        setWorkspaceMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [workspaceMenuOpen]);

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
        "hidden shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-[width] duration-200 ease-out lg:sticky lg:top-0 lg:flex lg:h-screen lg:max-h-screen lg:flex-col lg:self-start lg:overflow-y-auto",
        collapsed ? "w-[76px]" : "w-64",
      )}
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <div
        className={cn(
          "relative flex h-[72px] items-center",
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
            "size-8 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            collapsed
              ? "absolute -right-3 top-5 z-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-sm)]"
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

      <div className={cn("pb-2", collapsed ? "px-3" : "px-3")}>
        {collapsed ? (
          <div
            className="grid size-10 place-items-center rounded-lg bg-[var(--bg-elevated)] text-sm font-semibold text-[var(--text-primary)]"
            title={`${currentWorkspace.name} · ${currentRoleLabel}`}
          >
            {workspaceInitial}
          </div>
        ) : isClientRole ? (
          <div className="flex items-center gap-2.5 rounded-lg bg-[var(--bg-elevated)] px-2.5 py-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-primary)]">
              {workspaceInitial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                {currentWorkspace.name}
              </span>
              <span className="block truncate text-xs text-[var(--text-tertiary)]">
                {currentRoleLabel}
              </span>
            </span>
          </div>
        ) : (
          <div className="relative" ref={workspaceMenuRef}>
            <button
              aria-expanded={workspaceMenuOpen}
              aria-haspopup="listbox"
              className="flex w-full items-center gap-2.5 rounded-lg bg-[var(--bg-elevated)] px-2.5 py-2 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--bg-elevated)_70%,var(--border-subtle))]"
              onClick={() => setWorkspaceMenuOpen((open) => !open)}
              title="Trocar workspace"
              type="button"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--bg-surface)] text-sm font-semibold text-[var(--text-primary)]">
                {workspaceInitial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--text-primary)]">
                  {currentWorkspace.name}
                </span>
                <span className="block truncate text-xs text-[var(--text-tertiary)]">
                  {currentRoleLabel}
                </span>
              </span>
              <UnfoldVertical
                aria-hidden
                className="size-4 shrink-0 text-[var(--text-tertiary)]"
              />
            </button>
            {workspaceMenuOpen ? (
              <form
                action={switchWorkspaceAction}
                className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-lg)]"
              >
                {workspaces.map((workspace) => {
                  const isCurrent = workspace.id === currentWorkspace.id;
                  return (
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-elevated)]",
                        isCurrent
                          ? "font-semibold text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)]",
                      )}
                      key={workspace.id}
                      name="workspaceId"
                      type="submit"
                      value={workspace.id}
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-primary)]">
                        {workspace.name.trim().charAt(0).toUpperCase() || "W"}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {workspace.label}
                      </span>
                      {isCurrent ? (
                        <Check
                          aria-hidden
                          className="size-4 shrink-0 text-[var(--w3-red)]"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </form>
            ) : null}
          </div>
        )}
      </div>

      <nav className="px-3 pb-4">
        <div className="space-y-6">
          {SECTIONS.map((section) => {
            const items = navItems.filter(
              (item) => item.section === section.key,
            );
            if (items.length === 0) {
              return null;
            }

            return (
              <div className="space-y-1" key={section.key}>
                {collapsed ? (
                  <div className="mx-auto my-2 h-px w-6 bg-[var(--border-subtle)]" />
                ) : (
                  <p className="px-3 pb-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                    {section.label}
                  </p>
                )}
                {items.map((item) => {
                  const Icon = iconMap[item.icon];
                  const isActive = item.href === activeHref;

                  return (
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      aria-label={item.label}
                      className={cn(
                        "flex items-center rounded-md text-sm font-medium transition-colors",
                        collapsed
                          ? "justify-center px-0 py-2.5"
                          : "gap-3 px-3 py-2",
                        isActive
                          ? "bg-[var(--w3-red-bg)] text-[var(--w3-red)]"
                          : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]",
                      )}
                      href={item.href}
                      key={item.href}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon
                        aria-hidden
                        className="size-[18px] shrink-0"
                        strokeWidth={isActive ? 2.2 : 1.8}
                      />
                      {collapsed ? null : (
                        <span className="truncate">{item.label}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </nav>

      <div
        className={cn(
          "border-t border-[var(--border-subtle)] p-3",
          collapsed && "flex flex-col items-center gap-2",
        )}
      >
        {collapsed ? (
          <>
            <Avatar
              className="size-9"
              email={userEmail}
              image={userImage}
              name={userName}
            />
            <form action={logoutAction}>
              <Button
                aria-label="Sair"
                className="size-9 text-[var(--text-tertiary)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                size="icon"
                title="Sair"
                type="submit"
                variant="ghost"
              >
                <LogOut aria-hidden className="size-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-lg px-1.5 py-1.5">
            <Avatar
              className="size-9"
              email={userEmail}
              image={userImage}
              name={userName}
            />
            <div className="min-w-0 flex-1" title={userEmail}>
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {displayName}
              </p>
              <p className="truncate text-xs text-[var(--text-tertiary)]">
                {currentRoleLabel}
              </p>
            </div>
            <form action={logoutAction}>
              <Button
                aria-label="Sair"
                className="size-9 shrink-0 text-[var(--text-tertiary)] hover:bg-[var(--danger-bg)] hover:text-[var(--danger)]"
                size="icon"
                title="Sair"
                type="submit"
                variant="ghost"
              >
                <LogOut aria-hidden className="size-4" />
              </Button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
