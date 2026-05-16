import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const providers = ["Meta Ads", "Google Ads", "Shopify"];

export default function ConnectorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-caption text-[var(--text-tertiary)]">Conectores</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Fontes de dados</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider}>
            <CardHeader>
              <CardTitle>{provider}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--text-secondary)]">
                OAuth e sincronizacao entram na fase do conector.
              </p>
              <span className="mt-4 inline-flex rounded-[var(--radius-pill)] bg-[var(--warning-bg)] px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.04em] text-[var(--warning)]">
                Pendente
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
