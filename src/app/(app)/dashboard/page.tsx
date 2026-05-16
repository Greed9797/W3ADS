import {
  BarChart3,
  CircleDollarSign,
  MousePointerClick,
  PackageCheck,
  PlugZap,
  ReceiptText,
  TrendingUp,
} from "lucide-react";

import { LineChartW3 } from "@/components/charts/line-chart-w3";
import { FunnelW3 } from "@/components/dashboards/funnel-w3";
import { KpiCard } from "@/components/dashboards/kpi-card";
import { PeriodPicker } from "@/components/dashboards/period-picker";
import { TopCampaignsTable } from "@/components/dashboards/top-campaigns-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { getDashboardSnapshot } from "@/lib/metrics/aggregator";
import { getDemoDashboardSnapshot } from "@/lib/metrics/demo";
import { getDashboardPeriod } from "@/lib/metrics/period";
import { formatCurrencyBR, formatIntegerBR, formatRoasBR } from "@/lib/utils/format-br";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const period = getDashboardPeriod(params);
  const snapshot = context.isDemoMode
    ? getDemoDashboardSnapshot(period)
    : await getDashboardSnapshot({
        workspaceId: context.currentWorkspace.id,
        period,
      });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Performance Geral</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
            Dashboard executivo
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Período: {period.label}. Comparativo automático com os {period.days} dia(s)
            anteriores.
          </p>
        </div>
        <PeriodPicker period={period} />
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          accent="var(--w3-red)"
          deltaPercent={snapshot.kpis.revenue.deltaPercent}
          icon={<CircleDollarSign aria-hidden className="size-4" />}
          label="Faturamento"
          value={formatCurrencyBR(snapshot.kpis.revenue.value)}
        />
        <KpiCard
          accent="var(--border-strong)"
          deltaPercent={snapshot.kpis.spend.deltaPercent}
          icon={<TrendingUp aria-hidden className="size-4" />}
          label="Investimento Total"
          value={formatCurrencyBR(snapshot.kpis.spend.value)}
        />
        <KpiCard
          accent="var(--w3-gold)"
          deltaPercent={snapshot.kpis.roas.deltaPercent}
          icon={<BarChart3 aria-hidden className="size-4" />}
          label="ROAS Blended"
          value={formatRoasBR(snapshot.kpis.roas.value)}
        />
        <KpiCard
          accent="var(--success)"
          deltaPercent={snapshot.kpis.orders.deltaPercent}
          icon={<ReceiptText aria-hidden className="size-4" />}
          label="Pedidos"
          value={formatIntegerBR(snapshot.kpis.orders.value)}
        />
      </section>

      {!snapshot.hasData ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Sem dados nesse período</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Tente outro intervalo ou conecte uma nova conta.
              </p>
            </div>
            <BarChart3 aria-hidden className="size-5 text-[var(--w3-red)]" />
          </CardHeader>
          <CardContent className="grid min-h-72 place-items-center border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-8 text-center">
            <div className="max-w-sm">
              <PlugZap aria-hidden className="mx-auto mb-4 size-8 text-[var(--w3-red)]" />
              <h2 className="text-lg font-semibold">Você ainda não conectou uma conta.</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Conecte Shopify, Meta Ads ou Google Ads para substituir os zeros por dados reais.
              </p>
              <Button className="mt-5" asChild>
                <a href="/connectors">Conectar minha primeira conta</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.8fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Faturamento × Investimento</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Série diária do período selecionado.
              </p>
            </div>
            <BarChart3 aria-hidden className="size-5 text-[var(--w3-red)]" />
          </CardHeader>
          <CardContent>
            <LineChartW3 data={snapshot.lineSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Funil</CardTitle>
            <MousePointerClick aria-hidden className="size-5 text-[var(--w3-gold)]" />
          </CardHeader>
          <CardContent>
            <FunnelW3 funnel={snapshot.funnel} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Top 10 campanhas por ROAS</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Ranking calculado por receita atribuída dividida pelo investimento.
            </p>
          </div>
          <PackageCheck aria-hidden className="size-5 text-[var(--w3-gold)]" />
        </CardHeader>
        <CardContent>
          <TopCampaignsTable campaigns={snapshot.topCampaigns} />
        </CardContent>
      </Card>
    </div>
  );
}
