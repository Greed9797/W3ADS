"use client";

import { BookOpen, ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import type { ConnectorDocOption } from "@/lib/docs/loader";

type FaqConnectorMenuProps = {
  options: ConnectorDocOption[];
};

export function FaqConnectorMenu({ options }: FaqConnectorMenuProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentValue = options.some((option) => option.href === pathname)
    ? pathname
    : "";

  return (
    <section className="mb-6 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--w3-red)]"
          >
            <BookOpen className="size-4" />
          </span>
          <div>
            <p className="text-caption text-[var(--text-tertiary)]">
              Documentação por conector
            </p>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Selecione a integração que deseja revisar
            </h2>
          </div>
        </div>

        <label className="block w-full lg:max-w-[360px]">
          <span className="mb-2 block text-caption text-[var(--text-tertiary)]">
            Conector
          </span>
          <span className="relative block">
            <select
              className="h-11 w-full appearance-none rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 pr-10 text-sm font-semibold text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--w3-red)] focus:ring-4 focus:ring-[var(--w3-red-bg)]"
              onChange={(event) => {
                if (event.target.value) router.push(event.target.value);
              }}
              value={currentValue}
            >
              <option value="">Escolha uma documentação</option>
              {options.map((option) => (
                <option key={option.href} value={option.href}>
                  {option.label} · {option.type}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
          </span>
        </label>
      </div>
    </section>
  );
}
