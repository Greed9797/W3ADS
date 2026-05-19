import {
  BarChart3,
  MousePointerClick,
  PackageCheck,
  Percent,
  ReceiptText,
  ShoppingCart,
  TrendingUp,
  Users,
} from "lucide-react";

import { DashboardDonut } from "@/components/dashboards/dashboard-donut";
import { DashboardFilterBar } from "@/components/dashboards/dashboard-filter-bar";
import { OperationalFunnel } from "@/components/dashboards/operational-funnel";
import { OperationalKpiCard } from "@/components/dashboards/operational-kpi-card";
import {
  ConnectorRankingTable,
  ProductsTable,
} from "@/components/dashboards/operational-tables";
import { TopCampaignsTable } from "@/components/dashboards/top-campaigns-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { getDashboardSnapshot } from "@/lib/metrics/aggregator";
import { getDemoDashboardSnapshot } from "@/lib/metrics/demo";
import { getDashboardFilters } from "@/lib/metrics/period";
import {
  formatCurrencyBR,
  formatPercentBR,
  formatRoasBR,
} from "@/lib/utils/format-br";

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type DashboardSeriesKey =
  | "revenue"
  | "spend"
  | "mediaRate"
  | "previousRevenue"
  | "previousSpend"
  | "previousMediaRate";

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const filters = getDashboardFilters(params);
  const { period } = filters;
  const snapshot = context.isDemoMode
    ? getDemoDashboardSnapshot(period)
    : await getDashboardSnapshot({
        workspaceId: context.currentWorkspace.id,
        period,
      });

  const empty = !snapshot.hasData;
  const chartSeries = (
    currentKey: DashboardSeriesKey,
    previousKey: DashboardSeriesKey,
  ) =>
    snapshot.lineSeries.map((item) => ({
      label: item.label,
      value: item[currentKey],
      previousValue: item[previousKey],
    }));

  return (
    <div className="space-y-5">
      <section>
        <DashboardFilterBar filters={filters} showProviderFilters={false} />
      </section>

      {empty ? (
        <Card>
          <CardContent className="grid min-h-48 place-items-center border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-8 text-center">
            <div className="max-w-md">
              <BarChart3 aria-hidden className="mx-auto mb-4 size-8 text-[var(--w3-red)]" />
              <h2 className="text-lg font-semibold">Sem dados nesse período.</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Tente outro intervalo ou conecte uma nova conta. Não vamos estimar valores
                para preencher visual.
              </p>
              <Button className="mt-5" asChild>
                <a href="/connectors">Conectar minha primeira conta</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.35fr]">
        <OperationalKpiCard
          accent="var(--w3-red)"
          icon={<ReceiptText aria-hidden className="size-4" />}
          kpi={snapshot.kpis.revenue}
          label="Faturamento"
          previousValue={formatCurrencyBR(snapshot.kpis.revenue.previousValue)}
          chart={{
            data: chartSeries("revenue", "previousRevenue"),
            format: "currency",
          }}
          value={formatCurrencyBR(snapshot.kpis.revenue.value)}
        />
        <OperationalKpiCard
          accent="var(--w3-gold)"
          icon={<TrendingUp aria-hidden className="size-4" />}
          kpi={snapshot.kpis.spend}
          label="Valor investido"
          previousValue={formatCurrencyBR(snapshot.kpis.spend.previousValue)}
          chart={{
            data: chartSeries("spend", "previousSpend"),
            format: "currency",
          }}
          value={formatCurrencyBR(snapshot.kpis.spend.value)}
        />
        <OperationalKpiCard
          accent="var(--danger)"
          icon={<Percent aria-hidden className="size-4" />}
          kpi={snapshot.kpis.mediaRate}
          label="Custo de mídia"
          previousValue={formatPercentBR(snapshot.kpis.mediaRate.previousValue)}
          chart={{
            data: chartSeries("mediaRate", "previousMediaRate"),
            format: "percent",
          }}
          value={formatPercentBR(snapshot.kpis.mediaRate.value)}
        />
        <OperationalKpiCard
          accent="var(--w3-red)"
          icon={<TrendingUp aria-hidden className="size-4" />}
          kpi={snapshot.kpis.roas}
          label="ROAS Global"
          previousValue={formatRoasBR(snapshot.kpis.roas.previousValue)}
          value={formatRoasBR(snapshot.kpis.roas.value)}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <OperationalKpiCard
          accent="var(--info)"
          compact
          icon={<MousePointerClick aria-hidden className="size-4" />}
          kpi={snapshot.kpis.costPerSession}
          label="Custo por sessão"
          previousValue={formatCurrencyBR(snapshot.kpis.costPerSession.previousValue)}
          value={formatCurrencyBR(snapshot.kpis.costPerSession.value)}
        />
        <OperationalKpiCard
          accent="var(--success)"
          compact
          icon={<MousePointerClick aria-hidden className="size-4" />}
          kpi={snapshot.kpis.conversionRate}
          label="Taxa de conversão"
          previousValue={formatPercentBR(snapshot.kpis.conversionRate.previousValue)}
          value={formatPercentBR(snapshot.kpis.conversionRate.value)}
        />
        <OperationalKpiCard
          accent="var(--w3-gold)"
          compact
          icon={<ShoppingCart aria-hidden className="size-4" />}
          kpi={snapshot.kpis.averageOrderValue}
          label="Ticket médio"
          previousValue={formatCurrencyBR(snapshot.kpis.averageOrderValue.previousValue)}
          value={formatCurrencyBR(snapshot.kpis.averageOrderValue.value)}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <OperationalFunnel funnel={snapshot.funnel} />
        </div>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total de vendas por Estado</CardTitle>
              <ReceiptText aria-hidden className="size-4 text-[var(--w3-red)]" />
            </CardHeader>
            <CardContent>
              <DashboardDonut
                centerLabel="Vendas"
                centerValue={
                  snapshot.stateSales.length
                    ? formatCurrencyBR(
                        snapshot.stateSales.reduce((sum, item) => sum + item.value, 0),
                      )
                    : "—"
                }
                data={snapshot.stateSales}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sessões por Origem/Mídia da sessão</CardTitle>
              <Users aria-hidden className="size-4 text-[var(--w3-gold)]" />
            </CardHeader>
            <CardContent>
              <DashboardDonut
                centerLabel="Receita"
                centerValue={formatCurrencyBR(
                  snapshot.originMedia.reduce((sum, item) => sum + item.value, 0),
                )}
                data={snapshot.originMedia}
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Produtos</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Produtos vendidos quando o conector entregar itens de pedido.
              </p>
            </div>
            <PackageCheck aria-hidden className="size-4 text-[var(--w3-red)]" />
          </CardHeader>
          <CardContent>
            <ProductsTable products={snapshot.products} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Top 10 campanhas por ROAS</CardTitle>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Receita atribuída dividida pelo investimento.
              </p>
            </div>
            <BarChart3 aria-hidden className="size-4 text-[var(--w3-gold)]" />
          </CardHeader>
          <CardContent>
            <TopCampaignsTable campaigns={snapshot.topCampaigns} />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Ranking interno de lojas e contas</CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Agrupado por conector do workspace atual.
            </p>
          </div>
          <TrendingUp aria-hidden className="size-4 text-[var(--w3-red)]" />
        </CardHeader>
        <CardContent>
          <ConnectorRankingTable ranking={snapshot.connectorRanking} />
        </CardContent>
      </Card>
    </div>
  );
}
