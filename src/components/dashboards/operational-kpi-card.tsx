import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { KpiMiniChart } from "@/components/dashboards/kpi-mini-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardKpi } from "@/lib/metrics/aggregator";
import { cn } from "@/lib/utils/cn";
import { formatPercentBR } from "@/lib/utils/format-br";

type OperationalKpiCardProps = {
  label: string;
  value: string;
  previousValue: string;
  kpi: DashboardKpi;
  icon: ReactNode;
  accent?: string;
  compact?: boolean;
  chart?: {
    data: Array<{
      label: string;
      value: number;
      previousValue: number;
    }>;
    format: "currency" | "percent";
  };
};

export function OperationalKpiCard({
  accent = "var(--w3-red)",
  chart,
  compact = false,
  icon,
  kpi,
  label,
  previousValue,
  value,
}: OperationalKpiCardProps) {
  const isPositive = kpi.deltaPercent >= 0;
  const DeltaIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card
      className={cn(
        "relative overflow-hidden border-l-[3px] p-4",
        compact ? "min-h-[112px]" : "min-h-[132px]",
      )}
      style={{ borderLeftColor: accent }}
    >
      <CardHeader className="mb-3">
        <CardTitle>{label}</CardTitle>
        <span className="text-[var(--text-tertiary)]">{icon}</span>
      </CardHeader>
      <CardContent>
        <p
          className={cn(
            "font-[var(--font-display)] font-normal leading-none tracking-[-0.03em]",
            compact ? "text-2xl" : "text-[2rem]",
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">
          / {previousValue}
        </p>
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 font-mono text-[0.75rem] font-medium",
            isPositive ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}
        >
          <DeltaIcon aria-hidden className="size-3.5" />
          {formatPercentBR(Math.abs(kpi.deltaPercent))} vs. período anterior
        </p>
        {chart ? <KpiMiniChart accent={accent} data={chart.data} format={chart.format} /> : null}
      </CardContent>
    </Card>
  );
}
