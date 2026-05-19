import { ArrowUpRight, BarChart3, BadgePercent, CircleDollarSign, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ConnectorProvider } from "@prisma/client";

import { switchWorkspaceAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canManagePlatformUsers, canViewBrands } from "@/lib/auth/platform-permissions";
import { prisma } from "@/lib/db/prisma";
import { calculateRatioPercent, calculateRoas } from "@/lib/metrics/aggregator";
import { getDashboardPeriod } from "@/lib/metrics/period";
import { formatCurrencyBR, formatPercentBR, formatRoasBR } from "@/lib/utils/format-br";

type DashboardsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type BrandRow = {
  workspaceId: string;
  name: string;
  slug: string;
  revenue: number;
  spend: number;
  mediaRate: number;
  roas: number;
  metaRoas: number;
  googleRoas: number;
};

const demoBrands: BrandRow[] = [
  {
    workspaceId: "demo-workspace",
    name: "The Greg's Parfums",
    slug: "the-gregs-parfums",
    revenue: 10842.54,
    spend: 1511.6,
    mediaRate: 13.94,
    roas: 7.17,
    metaRoas: 2.58,
    googleRoas: 0,
  },
  {
    workspaceId: "demo-workspace",
    name: "GM Rosa do Deserto",
    slug: "gm-rosa-do-deserto",
    revenue: 1983.59,
    spend: 492.56,
    mediaRate: 24.83,
    roas: 4.03,
    metaRoas: 3.56,
    googleRoas: 0,
  },
  {
    workspaceId: "demo-workspace",
    name: "Divinal Studio",
    slug: "divinal-studio",
    revenue: 1138.39,
    spend: 302.79,
    mediaRate: 26.6,
    roas: 3.76,
    metaRoas: 0,
    googleRoas: 0,
  },
];

function sum(items: BrandRow[], key: keyof Pick<BrandRow, "revenue" | "spend">) {
  return items.reduce((total, item) => total + item[key], 0);
}

function summarizeBrands(brands: BrandRow[]) {
  const revenue = sum(brands, "revenue");
  const spend = sum(brands, "spend");

  return {
    revenue,
    spend,
    mediaRate: calculateRatioPercent(spend, revenue),
    roas: calculateRoas(revenue, spend),
  };
}

function formatSlug(slug: string) {
  return slug ? `${slug}.w3ads` : "marca-sem-slug.w3ads";
}

function metricValue(value: number, kind: "currency" | "percent" | "roas") {
  if (kind === "currency") return formatCurrencyBR(value);
  if (kind === "percent") return formatPercentBR(value);
  return formatRoasBR(value);
}

function SummaryCard({
  label,
  kind,
  value,
}: {
  label: string;
  kind: "currency" | "percent" | "roas";
  value: number;
}) {
  return (
    <Card className="min-h-[132px]">
      <CardHeader className="mb-3">
        <CardTitle className="normal-case tracking-normal">{label}</CardTitle>
        <span className="size-2 rounded-full bg-[var(--w3-red)] shadow-[0_0_0_4px_var(--w3-red-bg)]" />
      </CardHeader>
      <CardContent>
        <p className="font-[var(--font-display)] text-[2rem] leading-none tracking-[-0.03em] text-[var(--text-primary)]">
          {metricValue(value, kind)}
        </p>
      </CardContent>
    </Card>
  );
}

function BrandMetric({
  icon,
  kind,
  label,
  value,
}: {
  icon: ReactNode;
  kind: "currency" | "percent" | "roas";
  label: string;
  value: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <span className="grid size-5 place-items-center rounded-full bg-[var(--bg-surface)] text-[var(--w3-red)]">
          {icon}
        </span>
        {label}
      </div>
      <p className="font-[var(--font-display)] text-[1.65rem] leading-none tracking-[-0.03em] text-[var(--text-primary)]">
        {metricValue(value, kind)}
      </p>
    </div>
  );
}

function BrandCard({
  brand,
  isDemoMode,
  rank,
}: {
  brand: BrandRow;
  isDemoMode: boolean;
  rank: number;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <Tag aria-hidden className="mt-1 size-5 text-[var(--text-tertiary)]" />
          <span className="font-[var(--font-display)] text-2xl leading-none text-[var(--text-primary)]">
            {rank}°
          </span>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)]">
              {brand.name}
            </h3>
            <p className="mt-1 truncate text-sm text-[var(--text-secondary)]">
              {formatSlug(brand.slug)}
            </p>
          </div>
          {isDemoMode ? (
            <Button asChild size="sm" variant="secondary">
              <Link href="/dashboard">
                Dashboard
                <ArrowUpRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : (
            <form action={switchWorkspaceAction}>
              <input name="workspaceId" type="hidden" value={brand.workspaceId} />
              <Button size="sm" type="submit" variant="secondary">
                Dashboard
                <ArrowUpRight aria-hidden className="size-4" />
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid gap-6 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/65 p-6 md:grid-cols-2">
        <BrandMetric
          icon={<CircleDollarSign aria-hidden className="size-3.5" />}
          kind="currency"
          label="Faturamento"
          value={brand.revenue}
        />
        <BrandMetric
          icon={<BarChart3 aria-hidden className="size-3.5" />}
          kind="currency"
          label="Total investido"
          value={brand.spend}
        />
        <BrandMetric
          icon={<ArrowUpRight aria-hidden className="size-3.5" />}
          kind="roas"
          label="ROAS Global"
          value={brand.roas}
        />
        <BrandMetric
          icon={<BadgePercent aria-hidden className="size-3.5" />}
          kind="percent"
          label="% de mídia"
          value={brand.mediaRate}
        />
        <BrandMetric
          icon={<BarChart3 aria-hidden className="size-3.5" />}
          kind="roas"
          label="Meta ROAS"
          value={brand.metaRoas}
        />
        <BrandMetric
          icon={<BarChart3 aria-hidden className="size-3.5" />}
          kind="roas"
          label="Google ROAS"
          value={brand.googleRoas}
        />
      </div>
    </Card>
  );
}

async function getRealBrands(from: Date, to: Date): Promise<BrandRow[]> {
  const [workspaces, orders, metrics] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    }),
    prisma.ecommerceOrder.findMany({
      where: {
        placedAt: {
          gte: from,
          lte: to,
        },
      },
      select: {
        workspaceId: true,
        orderTotal: true,
      },
    }),
    prisma.dailyMetric.findMany({
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
      select: {
        workspaceId: true,
        source: true,
        spend: true,
        conversionsValue: true,
      },
    }),
  ]);

  const rows = new Map<string, BrandRow>();

  for (const workspace of workspaces) {
    rows.set(workspace.id, {
      workspaceId: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      revenue: 0,
      spend: 0,
      mediaRate: 0,
      roas: 0,
      metaRoas: 0,
      googleRoas: 0,
    });
  }

  for (const order of orders) {
    const row = rows.get(order.workspaceId);
    if (row) {
      row.revenue += Number(order.orderTotal);
    }
  }

  const providerTotals = new Map<
    string,
    {
      metaSpend: number;
      metaValue: number;
      googleSpend: number;
      googleValue: number;
    }
  >();

  for (const metric of metrics) {
    const row = rows.get(metric.workspaceId);
    if (!row) continue;

    const spend = Number(metric.spend ?? 0);
    const conversionsValue = Number(metric.conversionsValue ?? 0);
    row.spend += spend;

    const provider = providerTotals.get(metric.workspaceId) ?? {
      metaSpend: 0,
      metaValue: 0,
      googleSpend: 0,
      googleValue: 0,
    };

    if (metric.source === ConnectorProvider.META_ADS) {
      provider.metaSpend += spend;
      provider.metaValue += conversionsValue;
    }

    if (metric.source === ConnectorProvider.GOOGLE_ADS) {
      provider.googleSpend += spend;
      provider.googleValue += conversionsValue;
    }

    providerTotals.set(metric.workspaceId, provider);
  }

  return Array.from(rows.values())
    .map((row) => {
      const provider = providerTotals.get(row.workspaceId);

      return {
        ...row,
        revenue: Number(row.revenue.toFixed(2)),
        spend: Number(row.spend.toFixed(2)),
        mediaRate: calculateRatioPercent(row.spend, row.revenue),
        roas: calculateRoas(row.revenue, row.spend),
        metaRoas: calculateRoas(provider?.metaValue ?? 0, provider?.metaSpend ?? 0),
        googleRoas: calculateRoas(provider?.googleValue ?? 0, provider?.googleSpend ?? 0),
      };
    })
    .filter((row) => row.revenue > 0 || row.spend > 0)
    .sort((a, b) => b.revenue - a.revenue);
}

export default async function DashboardsPage({ searchParams }: DashboardsPageProps) {
  const context = await getCurrentUserContext();

  if (!canViewBrands(context.user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const period = getDashboardPeriod(params);
  const brands = context.isDemoMode ? demoBrands : await getRealBrands(period.from, period.to);
  const totals = summarizeBrands(brands);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Marcas</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
            Central de marcas
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Visão interna do Admin Master por marca, faturamento e mídia no período atual.
          </p>
        </div>
        {canManagePlatformUsers(context.user) ? (
          <Button asChild>
            <Link href="/workspace/settings">
              <Plus aria-hidden className="size-4" />
              Nova marca
            </Link>
          </Button>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard kind="currency" label="Total faturado" value={totals.revenue} />
        <SummaryCard kind="currency" label="Total investido" value={totals.spend} />
        <SummaryCard kind="percent" label="% de mídia" value={totals.mediaRate} />
        <SummaryCard kind="roas" label="ROAS Global" value={totals.roas} />
      </section>

      {brands.length ? (
        <section className="grid gap-4 xl:grid-cols-3">
          {brands.map((brand, index) => (
            <BrandCard
              brand={brand}
              isDemoMode={context.isDemoMode}
              key={`${brand.workspaceId}-${brand.slug}`}
              rank={index + 1}
            />
          ))}
        </section>
      ) : (
        <Card>
          <CardContent className="grid min-h-64 place-items-center p-8 text-center">
            <div className="max-w-sm">
              <Tag aria-hidden className="mx-auto mb-4 size-8 text-[var(--w3-red)]" />
              <h3 className="text-lg font-semibold">Nenhuma marca com dados no período.</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Conecte contas e lojas aos workspaces para alimentar esta visão.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
