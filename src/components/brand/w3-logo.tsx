import Link from "next/link";

import { cn } from "@/lib/utils/cn";

type W3LogoProps = {
  className?: string;
  compact?: boolean;
};

export function W3Logo({ className, compact = false }: W3LogoProps) {
  return (
    <Link
      aria-label="Grupo W3 Ads"
      className={cn("inline-flex items-center gap-2 text-[var(--text-primary)]", className)}
      href="/"
    >
      <span aria-hidden className="grid size-8 place-items-center rounded-sm bg-[var(--w3-red)]">
        <span className="font-sans text-[0.68rem] font-black leading-none text-white">W3</span>
      </span>
      <span className="leading-none">
        <span className="block text-sm font-extrabold tracking-[-0.01em]">Grupo W3</span>
        {compact ? null : (
          <span className="mt-1 block text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[var(--w3-red)]">
            Ads Intelligence
          </span>
        )}
      </span>
    </Link>
  );
}
