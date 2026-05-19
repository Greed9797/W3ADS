"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import type { DashboardBreakdownItem } from "@/lib/metrics/aggregator";
import { formatCurrencyBR, formatIntegerBR, formatPercentBR } from "@/lib/utils/format-br";

const colors = [
  "var(--w3-red)",
  "var(--info)",
  "var(--w3-gold)",
  "var(--success)",
  "var(--warning)",
  "var(--text-tertiary)",
];

type DashboardDonutProps = {
  data: DashboardBreakdownItem[];
  centerLabel: string;
  centerValue: string;
  valueKind?: "currency" | "integer";
};

type TooltipPayload = {
  payload?: DashboardBreakdownItem;
};

function DonutTooltip({
  active,
  payload,
  valueKind = "currency",
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  valueKind?: DashboardDonutProps["valueKind"];
}) {
  const item = payload?.[0]?.payload;

  if (!active || !item) {
    return null;
  }

  const value =
    valueKind === "integer" ? formatIntegerBR(item.value) : formatCurrencyBR(item.value);

  return (
    <div className="rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 text-xs shadow-lg">
      <p className="font-semibold">{item.label}</p>
      <p className="mt-1 text-[var(--text-secondary)]">
        {value} · {formatPercentBR(item.percent)}
      </p>
    </div>
  );
}

export function DashboardDonut({
  centerLabel,
  centerValue,
  data,
  valueKind = "currency",
}: DashboardDonutProps) {
  if (!data.length) {
    return (
      <div className="grid min-h-[230px] place-items-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6 text-center text-sm text-[var(--text-secondary)]">
        Sem dados nesse período.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative h-[230px]">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer>
            <Tooltip content={<DonutTooltip valueKind={valueKind} />} />
            <Pie
              data={data}
              dataKey="value"
              innerRadius="66%"
              nameKey="label"
              outerRadius="86%"
              paddingAngle={3}
              stroke="var(--bg-surface)"
              strokeWidth={3}
            >
              {data.map((entry, index) => (
                <Cell fill={colors[index % colors.length]} key={entry.label} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-semibold">{centerValue}</p>
            <p className="text-caption text-[var(--text-tertiary)]">{centerLabel}</p>
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        {data.slice(0, 5).map((item, index) => (
          <div className="flex items-center justify-between gap-3 text-xs" key={item.label}>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-[var(--radius-pill)]"
                style={{ background: colors[index % colors.length] }}
              />
              <span className="truncate">{item.label}</span>
            </span>
            <span className="font-mono text-[var(--text-tertiary)]">
              {formatPercentBR(item.percent)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
