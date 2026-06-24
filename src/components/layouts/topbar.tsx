import Link from "next/link";

import { W3Logo } from "@/components/brand/w3-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import type { getCurrentUserContext } from "@/lib/auth/current";
import { getWorkspaceRoleDefinition } from "@/lib/auth/permissions";
import { canAddWorkspaceConnectors } from "@/lib/auth/platform-permissions";
import { MobileNavTrigger } from "./mobile-nav-trigger";
import { SyncButton } from "./sync-button";

type AppContext = Awaited<ReturnType<typeof getCurrentUserContext>>;

export function Topbar({ context }: { context: AppContext }) {
  const role = getWorkspaceRoleDefinition(context.currentMembership.role);
  // Read-only roles can't trigger sync (enforced server-side in
  // manualSyncAction) — don't show a control that would only error.
  const canSync = canAddWorkspaceConnectors(
    context.user,
    context.currentMembership.role,
  );

  return (
    <header className="sticky top-0 z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[color-mix(in_srgb,var(--bg-canvas)_88%,transparent)] px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNavTrigger />
        <Link
          aria-label="Início"
          className="mr-1 hidden shrink-0 sm:block"
          href="/"
        >
          <W3Logo />
        </Link>
        <div className="min-w-0">
          <p className="text-caption text-[var(--text-tertiary)]">
            {context.currentWorkspace.name} / {role.label}
          </p>
          <h1 className="mt-1 truncate font-sans text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
            Central de crescimento W3
          </h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ThemeToggle />
        {canSync ? <SyncButton /> : null}
      </div>
    </header>
  );
}
