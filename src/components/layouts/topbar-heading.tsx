"use client";

import { usePathname } from "next/navigation";

/**
 * Shows the active workspace breadcrumb only when the user is actually inside a
 * workspace. On Marcas (the lobby, `/dashboards`) no brand is "open", so the
 * breadcrumb is hidden — it would otherwise display a brand the user isn't
 * really in. The page title is always shown.
 */
export function TopbarHeading({
  workspaceLabel,
  title,
}: {
  workspaceLabel: string;
  title: string;
}) {
  const pathname = usePathname() ?? "";
  const isLobby = pathname === "/dashboards";

  return (
    <div className="min-w-0">
      {isLobby ? null : (
        <p className="text-caption text-[var(--text-tertiary)]">
          {workspaceLabel}
        </p>
      )}
      <h1 className="mt-1 truncate font-sans text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.75rem]">
        {title}
      </h1>
    </div>
  );
}
