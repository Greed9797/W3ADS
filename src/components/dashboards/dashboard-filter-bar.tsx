import { CalendarDays, Filter } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  dashboardCommerceProviderLabels,
  dashboardCommerceProviders,
  dashboardTrafficProviderLabels,
  dashboardTrafficProviders,
  toDateKey,
  type DashboardFilters,
  type DashboardPeriodPreset,
} from "@/lib/metrics/period";
import { cn } from "@/lib/utils/cn";

const presets: Array<{ value: DashboardPeriodPreset; label: string }> = [
  { value: "real_time", label: "Tempo Real" },
  { value: "month", label: "Mês" },
  { value: "week", label: "Semana" },
  { value: "day", label: "Dia" },
];

function selectedProviderParams(filters: DashboardFilters, includeProviderFilters = true) {
  const params = new URLSearchParams();
  if (includeProviderFilters) {
    filters.trafficProviders.forEach((provider) => params.append("traffic", provider));
    filters.commerceProviders.forEach((provider) => params.append("commerce", provider));
  }
  params.set("from", toDateKey(filters.period.from));
  params.set("to", toDateKey(filters.period.to));
  params.set("compareFrom", toDateKey(filters.period.comparison.from));
  params.set("compareTo", toDateKey(filters.period.comparison.to));
  return params;
}

function presetHref(filters: DashboardFilters, preset: DashboardPeriodPreset, includeProviderFilters = true) {
  const params = selectedProviderParams(filters, includeProviderFilters);
  params.set("period", preset);
  return `/dashboard?${params.toString()}`;
}

export function DashboardFilterBar({
  filters,
  showProviderFilters = true,
}: {
  filters: DashboardFilters;
  showProviderFilters?: boolean;
}) {
  const { period } = filters;

  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 shadow-sm">
      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-stretch">
        <nav className="grid grid-cols-2 gap-2 sm:flex" aria-label="Presets de período">
          {presets.map((preset) => (
            <a
              className={cn(
                "inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-semibold transition-colors",
                period.preset === preset.value
                  ? "border-[var(--w3-red)] bg-[var(--w3-red-bg)] text-[var(--w3-red)]"
                  : "border-transparent bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:border-[var(--border-strong)]",
              )}
              href={presetHref(filters, preset.value, showProviderFilters)}
              key={preset.value}
            >
              {preset.label}
            </a>
          ))}
        </nav>

        <form
          className={cn(
            "grid flex-1 gap-3 lg:grid-cols-2",
            showProviderFilters
              ? "2xl:grid-cols-[1fr_1fr_1.2fr_1.6fr_auto]"
              : "2xl:grid-cols-[1fr_1fr_auto]",
          )}
          method="get"
        >
          <input name="period" type="hidden" value="custom" />

          <fieldset className="grid grid-cols-2 gap-2 lg:min-w-[280px]">
            <legend className="sr-only">Período principal</legend>
            <label className="grid gap-1">
              <span className="text-caption text-[var(--text-tertiary)]">De</span>
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                defaultValue={toDateKey(period.from)}
                name="from"
                type="date"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-[var(--text-tertiary)]">Até</span>
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                defaultValue={toDateKey(period.to)}
                name="to"
                type="date"
              />
            </label>
          </fieldset>

          <fieldset className="grid grid-cols-2 gap-2 lg:min-w-[280px]">
            <legend className="sr-only">Período comparativo</legend>
            <label className="grid gap-1">
              <span className="text-caption text-[var(--text-tertiary)]">Comp. de</span>
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                defaultValue={toDateKey(period.comparison.from)}
                name="compareFrom"
                type="date"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-caption text-[var(--text-tertiary)]">Comp. até</span>
              <input
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                defaultValue={toDateKey(period.comparison.to)}
                name="compareTo"
                type="date"
              />
            </label>
          </fieldset>

          {showProviderFilters ? (
            <fieldset className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2">
              <legend className="mb-2 flex items-center gap-1 text-caption text-[var(--text-tertiary)]">
                <Filter aria-hidden className="size-3.5" />
                Tráfego
              </legend>
              <div className="flex flex-wrap gap-2">
                {dashboardTrafficProviders.map((provider) => (
                  <label
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-semibold"
                    key={provider}
                  >
                    <input
                      className="accent-[var(--w3-red)]"
                      defaultChecked={filters.trafficProviders.includes(provider)}
                      name="traffic"
                      type="checkbox"
                      value={provider}
                    />
                    {dashboardTrafficProviderLabels[provider]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {showProviderFilters ? (
            <fieldset className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2">
              <legend className="mb-2 flex items-center gap-1 text-caption text-[var(--text-tertiary)]">
                <CalendarDays aria-hidden className="size-3.5" />
                E-commerce
              </legend>
              <div className="flex flex-wrap gap-2">
                {dashboardCommerceProviders.map((provider) => (
                  <label
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-xs font-semibold"
                    key={provider}
                  >
                    <input
                      className="accent-[var(--w3-red)]"
                      defaultChecked={filters.commerceProviders.includes(provider)}
                      name="commerce"
                      type="checkbox"
                      value={provider}
                    />
                    {dashboardCommerceProviderLabels[provider]}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          <Button className="self-end" type="submit" variant="primary">
            Aplicar
          </Button>
        </form>
      </div>
    </section>
  );
}
