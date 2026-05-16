import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  PackageCheck,
  PlugZap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const kpis = [
  {
    label: "Faturamento",
    value: "R$ 0,00",
    delta: "0.0%",
    positive: true,
    accent: "var(--w3-red)",
  },
  {
    label: "Investimento Total",
    value: "R$ 0,00",
    delta: "0.0%",
    positive: false,
    accent: "var(--border-strong)",
  },
  {
    label: "ROAS Blended",
    value: "0.00x",
    delta: "0.0%",
    positive: true,
    accent: "var(--w3-gold)",
  },
  {
    label: "Pedidos",
    value: "0",
    delta: "0.0%",
    positive: true,
    accent: "var(--success)",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            className="relative overflow-hidden border-l-[3px]"
            key={kpi.label}
            style={{ borderLeftColor: kpi.accent }}
          >
            <CardHeader className="mb-4">
              <CardTitle>{kpi.label}</CardTitle>
              <CircleDollarSign aria-hidden className="size-4 text-[var(--text-tertiary)]" />
            </CardHeader>
            <CardContent>
              <p className="text-kpi">{kpi.value}</p>
              <p
                className={`mt-3 inline-flex items-center gap-1 font-mono text-[0.8125rem] font-medium ${
                  kpi.positive ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {kpi.positive ? (
                  <ArrowUpRight aria-hidden className="size-4" />
                ) : (
                  <ArrowDownRight aria-hidden className="size-4" />
                )}
                {kpi.delta} vs periodo anterior
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sem dados nesse periodo</CardTitle>
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
              Conectores de Meta Ads, Google Ads e Shopify entram nas proximas fases.
            </p>
            <Button className="mt-5" asChild>
              <a href="/connectors">Conectar minha primeira conta</a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Funil</CardTitle>
          <PackageCheck aria-hidden className="size-5 text-[var(--w3-gold)]" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-secondary)]">
            O funil real sera calculado quando os conectores iniciarem a ingestao.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
