import { ConnectorProvider } from "@prisma/client";

import type {
  DashboardConnectorRankingRow,
  DashboardProductRow,
} from "@/lib/metrics/aggregator";
import {
  dashboardCommerceProviderLabels,
  dashboardTrafficProviderLabels,
} from "@/lib/metrics/period";
import { formatCurrencyBR, formatIntegerBR, formatPercentBR, formatRoasBR } from "@/lib/utils/format-br";

function providerLabel(provider: ConnectorProvider) {
  if (provider in dashboardTrafficProviderLabels) {
    return dashboardTrafficProviderLabels[provider as keyof typeof dashboardTrafficProviderLabels];
  }

  if (provider in dashboardCommerceProviderLabels) {
    return dashboardCommerceProviderLabels[provider as keyof typeof dashboardCommerceProviderLabels];
  }

  return provider;
}

export function ProductsTable({ products }: { products: DashboardProductRow[] }) {
  if (!products.length) {
    return (
      <div className="grid min-h-[176px] place-items-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6 text-center text-sm text-[var(--text-secondary)]">
        Ainda não recebemos produto vendido em dados normalizados. O widget fica vazio até a plataforma entregar itens de pedido.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[540px] text-sm">
        <thead>
          <tr className="bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
            <th className="px-3 py-3 text-left">Produto</th>
            <th className="px-3 py-3 text-right">Qtd.</th>
            <th className="px-3 py-3 text-right">Receita</th>
            <th className="px-3 py-3 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr className="border-b border-[var(--border-subtle)]" key={product.productName}>
              <td className="px-3 py-3 font-medium">{product.productName}</td>
              <td className="px-3 py-3 text-right font-mono">
                {formatIntegerBR(product.quantitySold)}
              </td>
              <td className="px-3 py-3 text-right font-mono">{formatCurrencyBR(product.revenue)}</td>
              <td className="px-3 py-3">
                <span className="rounded-[var(--radius-pill)] bg-[var(--success-bg)] px-2 py-1 text-[0.6875rem] font-semibold uppercase text-[var(--success)]">
                  Disponível
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ConnectorRankingTable({
  ranking,
}: {
  ranking: DashboardConnectorRankingRow[];
}) {
  if (!ranking.length) {
    return (
      <div className="grid min-h-[176px] place-items-center rounded-md border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] p-6 text-center text-sm text-[var(--text-secondary)]">
        Sem lojas ou contas com dados no período filtrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-sm">
        <thead>
          <tr className="bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
            <th className="px-3 py-3 text-left">Conta/Loja</th>
            <th className="px-3 py-3 text-left">Plataforma</th>
            <th className="px-3 py-3 text-right">Faturamento</th>
            <th className="px-3 py-3 text-right">Investido</th>
            <th className="px-3 py-3 text-right">ROAS</th>
            <th className="px-3 py-3 text-right">% mídia</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((row, index) => (
            <tr
              className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]"
              key={row.connectorAccountId}
            >
              <td className="px-3 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-[var(--text-tertiary)]">
                    {index + 1}º
                  </span>
                  <span className="font-medium">{row.accountName}</span>
                </div>
              </td>
              <td className="px-3 py-3 text-[var(--text-secondary)]">
                {providerLabel(row.provider)}
              </td>
              <td className="px-3 py-3 text-right font-mono">
                {formatCurrencyBR(row.revenue)}
              </td>
              <td className="px-3 py-3 text-right font-mono">{formatCurrencyBR(row.spend)}</td>
              <td className="px-3 py-3 text-right font-mono">{formatRoasBR(row.roas)}</td>
              <td className="px-3 py-3 text-right font-mono">
                {formatPercentBR(row.mediaRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
