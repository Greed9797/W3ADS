import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  LayoutDashboard,
  Megaphone,
  PackageCheck,
  PlugZap,
  Settings,
  ShoppingBag,
  UsersRound,
} from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const navSections = [
  {
    label: "Operacao",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, active: true },
      { label: "Conectores", icon: PlugZap },
      { label: "Campanhas", icon: Megaphone },
      { label: "Pedidos", icon: ShoppingBag },
    ],
  },
  {
    label: "Gestao",
    items: [
      { label: "Membros", icon: UsersRound },
      { label: "Ajustes", icon: Settings },
    ],
  },
];

const kpis = [
  {
    label: "Faturamento",
    value: "R$ 128.450",
    delta: "12.5%",
    positive: true,
    accent: "var(--w3-red)",
  },
  {
    label: "Investimento Total",
    value: "R$ 31.280",
    delta: "4.2%",
    positive: false,
    accent: "var(--border-strong)",
  },
  {
    label: "ROAS Blended",
    value: "4.11x",
    delta: "8.8%",
    positive: true,
    accent: "var(--w3-gold)",
  },
  {
    label: "Pedidos",
    value: "1.248",
    delta: "6.1%",
    positive: true,
    accent: "var(--success)",
  },
];

const campaigns = [
  { name: "PMax - Dia dos Namorados", source: "Google Ads", spend: "R$ 8.420", roas: "6.8x" },
  { name: "Meta - Lookalike Compradores", source: "Meta Ads", spend: "R$ 5.910", roas: "5.4x" },
  { name: "Search - Marca W3", source: "Google Ads", spend: "R$ 2.180", roas: "4.9x" },
  { name: "Instagram - Oferta Relampago", source: "Meta Ads", spend: "R$ 4.760", roas: "3.7x" },
];

const chartBars = [42, 58, 48, 64, 72, 55, 84, 78, 92, 74, 88, 96];

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="grid min-h-screen lg:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-[var(--border-subtle)] bg-[var(--bg-surface)] lg:block">
          <div className="flex h-[72px] items-center border-b border-[var(--border-subtle)] px-5">
            <Image src="/logo-w3.svg" alt="Adstart W3" width={140} height={32} priority />
          </div>
          <nav className="space-y-8 p-5">
            {navSections.map((section) => (
              <div key={section.label} className="space-y-2">
                <p className="px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <a
                        className={`flex items-center gap-3 border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${
                          item.active
                            ? "border-[var(--w3-red)] bg-[var(--w3-red-bg)] text-[var(--w3-red)]"
                            : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                        }`}
                        href="#"
                        key={item.label}
                      >
                        <Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />
                        {item.label}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 flex min-h-[72px] flex-wrap items-center justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-4 py-4 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="text-caption text-[var(--text-tertiary)]">Performance Geral</p>
              <h1 className="mt-1 truncate font-sans text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">
                Central de crescimento W3
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" className="gap-2">
                <CalendarDays aria-hidden className="size-4" />
                Ultimos 30 dias
                <ChevronDown aria-hidden className="size-4" />
              </Button>
              <Button>
                <PlugZap aria-hidden className="size-4" />
                Conectar minha primeira conta
              </Button>
            </div>
          </header>

          <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => (
                <Card className="relative overflow-hidden border-l-[3px]" key={kpi.label} style={{ borderLeftColor: kpi.accent }}>
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

            <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Faturamento x Investimento</CardTitle>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">Sincronizado agora</p>
                  </div>
                  <BarChart3 aria-hidden className="size-5 text-[var(--w3-red)]" />
                </CardHeader>
                <CardContent>
                  <div className="flex h-72 items-end gap-3 border-b border-l border-[var(--border-subtle)] px-3 pt-6">
                    {chartBars.map((height, index) => (
                      <div className="flex min-w-0 flex-1 flex-col items-center gap-2" key={height + index}>
                        <div className="flex h-56 w-full items-end justify-center gap-1">
                          <span
                            className="w-full max-w-5 rounded-t-sm bg-[var(--w3-red)]"
                            style={{ height: `${height}%` }}
                          />
                          <span
                            className="w-full max-w-5 rounded-t-sm bg-[var(--w3-gold)]"
                            style={{ height: `${Math.max(18, height - 22)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[0.6875rem] text-[var(--text-tertiary)]">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Funil</CardTitle>
                  <PackageCheck aria-hidden className="size-5 text-[var(--w3-gold)]" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    ["Impressoes", "1.9 mi", "100%"],
                    ["Cliques", "84.120", "4.4%"],
                    ["Sessoes", "62.800", "74.6%"],
                    ["Pedidos", "1.248", "2.0%"],
                  ].map(([label, value, rate]) => (
                    <div key={label}>
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
                        <span className="font-mono text-[var(--text-primary)]">{value}</span>
                      </div>
                      <div className="h-2 rounded-[var(--radius-pill)] bg-[var(--bg-elevated)]">
                        <div
                          className="h-full rounded-[var(--radius-pill)] bg-[var(--w3-red)]"
                          style={{ width: rate === "100%" ? "100%" : rate }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Top campanhas por ROAS</CardTitle>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">Dados consolidados de Meta e Google Ads</p>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto scrollbar-stable">
                <table className="w-full min-w-[680px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
                      <th className="px-4 py-3">Campanha</th>
                      <th className="px-4 py-3">Fonte</th>
                      <th className="px-4 py-3 text-right">Investimento</th>
                      <th className="px-4 py-3 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((campaign, index) => (
                      <tr
                        className={`border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] ${
                          index === 0 ? "border-l-[3px] border-l-[var(--w3-gold)]" : ""
                        }`}
                        key={campaign.name}
                      >
                        <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{campaign.name}</td>
                        <td className="px-4 py-3 text-[var(--text-secondary)]">{campaign.source}</td>
                        <td className="px-4 py-3 text-right font-mono">{campaign.spend}</td>
                        <td className="px-4 py-3 text-right font-mono text-[var(--success)]">{campaign.roas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
