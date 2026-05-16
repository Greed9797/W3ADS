import { LayoutDashboard, Plus, Star } from "lucide-react";
import Link from "next/link";

import {
  duplicateDefaultDashboardAction,
  ensureDefaultDashboardAction,
  setDefaultDashboardAction,
} from "@/app/(app)/dashboards/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";
import { canEditDashboards } from "@/lib/auth/permissions";
import { getDemoDashboards } from "@/lib/dashboards/demo-storage";
import { parseDashboardWidgets } from "@/lib/dashboards/store";
import { prisma } from "@/lib/db/prisma";

type DashboardsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardsPage({ searchParams }: DashboardsPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const canEdit = canEditDashboards(context.currentMembership.role);
  const dashboards = context.isDemoMode
    ? await getDemoDashboards()
    : await prisma.dashboard.findMany({
        where: { workspaceId: context.currentWorkspace.id },
        orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
      });

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Dashboards</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
            Painéis do workspace
          </h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Crie visões por operação, cliente ou rotina semanal.
          </p>
        </div>
        {canEdit ? (
          <Button asChild>
            <Link href="/dashboards/new">
              <Plus aria-hidden className="size-4" />
              Novo dashboard
            </Link>
          </Button>
        ) : null}
      </section>

      {params.default ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Dashboard padrão atualizado.
        </p>
      ) : null}

      {!dashboards.length ? (
        <Card>
          <CardContent className="grid min-h-64 place-items-center p-8 text-center">
            <div className="max-w-sm">
              <LayoutDashboard aria-hidden className="mx-auto mb-4 size-8 text-[var(--w3-red)]" />
              <h3 className="text-lg font-semibold">Nenhum dashboard criado ainda.</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Crie o dashboard padrão Performance Geral para começar.
              </p>
              {canEdit ? (
                <form action={ensureDefaultDashboardAction}>
                  <Button className="mt-5" type="submit">
                    Criar dashboard padrão
                  </Button>
                </form>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dashboards.map((dashboard) => {
            const widgets = parseDashboardWidgets(dashboard.widgets);

            return (
              <Card key={dashboard.id}>
                <CardHeader>
                  <CardTitle>{dashboard.name}</CardTitle>
                  {dashboard.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--w3-gold-bg)] px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-[var(--w3-gold)]">
                      <Star aria-hidden className="size-3" />
                      Padrão
                    </span>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-5">
                  <p className="text-sm text-[var(--text-secondary)]">
                    {widgets.length} widget(s) configurado(s)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/dashboards/${dashboard.id}`}>Abrir</Link>
                    </Button>
                    {canEdit && !dashboard.isDefault ? (
                      <form action={setDefaultDashboardAction}>
                        <input name="dashboardId" type="hidden" value={dashboard.id} />
                        <Button size="sm" type="submit" variant="ghost">
                          Tornar padrão
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {canEdit && context.isDemoMode ? (
        <form action={duplicateDefaultDashboardAction}>
          <Button type="submit" variant="secondary">
            Duplicar Performance Geral para editar
          </Button>
        </form>
      ) : null}
    </div>
  );
}
