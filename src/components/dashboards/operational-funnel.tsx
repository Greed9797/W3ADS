import { SlidersHorizontal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardSnapshot } from "@/lib/metrics/aggregator";
import { formatIntegerBR, formatPercentBR } from "@/lib/utils/format-br";

export function OperationalFunnel({ funnel }: { funnel: DashboardSnapshot["funnel"] }) {
  const max = Math.max(...funnel.stages.map((stage) => stage.value), 1);

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-[var(--radius-pill)] bg-[var(--w3-red-bg)] text-[var(--w3-red)]">
            <SlidersHorizontal aria-hidden className="size-3.5" />
          </span>
          <CardTitle>Funil</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid min-h-[250px] grid-cols-5 gap-2">
            {funnel.stages.map((stage, index) => {
              const height = stage.available ? 104 + Math.min((stage.value / max) * 36, 36) : 116;
              const opacity = stage.available ? 1 : 0.42;

              return (
                <div className="flex min-w-0 flex-col gap-2" key={stage.id}>
                  <div className="min-h-12">
                    <p className="truncate text-xs font-semibold">{stage.label}</p>
                    <p className="text-[0.6875rem] text-[var(--text-tertiary)]">
                      {stage.available
                        ? `(${formatPercentBR(stage.percentOfFirstStage)})`
                        : "Sem evento"}
                    </p>
                  </div>
                  <div className="relative flex min-h-[150px] items-center">
                    <div
                      className="grid w-full place-items-center bg-[var(--w3-red)] px-2 text-center text-[0.8125rem] font-semibold text-white shadow-sm"
                      style={{
                        clipPath:
                          index === funnel.stages.length - 1
                            ? "polygon(0 10%, 100% 20%, 100% 80%, 0 90%)"
                            : "polygon(0 0, 100% 14%, 100% 86%, 0 100%)",
                        height,
                        opacity,
                      }}
                    >
                      {stage.available ? formatIntegerBR(stage.value) : "—"}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </CardContent>
    </Card>
  );
}
