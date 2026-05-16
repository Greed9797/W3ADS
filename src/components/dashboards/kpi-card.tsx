import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPercentBR } from "@/lib/utils/format-br";
import { cn } from "@/lib/utils/cn";

type KpiCardProps = {
  label: string;
  value: string;
  deltaPercent: number;
  accent: string;
  icon: ReactNode;
};

export function KpiCard({ label, value, deltaPercent, accent, icon }: KpiCardProps) {
  const isPositive = deltaPercent >= 0;
  const DeltaIcon = isPositive ? ArrowUpRight : ArrowDownRight;

  return (
    <Card className="relative overflow-hidden border-l-[3px]" style={{ borderLeftColor: accent }}>
      <CardHeader className="mb-4">
        <CardTitle>{label}</CardTitle>
        <span className="text-[var(--text-tertiary)]">{icon}</span>
      </CardHeader>
      <CardContent>
        <p className="text-kpi">{value}</p>
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-1 font-mono text-[0.8125rem] font-medium",
            isPositive ? "text-[var(--success)]" : "text-[var(--danger)]",
          )}
        >
          <DeltaIcon aria-hidden className="size-4" />
          {formatPercentBR(Math.abs(deltaPercent))} vs período anterior
        </p>
      </CardContent>
    </Card>
  );
}
