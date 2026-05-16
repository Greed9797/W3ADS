import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-10 text-[var(--text-primary)]">
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Politica de privacidade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            Esta politica e um rascunho operacional para o beta privado. Dados pessoais
            sao usados para autenticar usuarios, operar workspaces e auditar acoes
            sensiveis.
          </p>
          <p>
            O contato de privacidade previsto para o produto e dpo@w3educacao.com.br.
            Exportacao e exclusao de dados entram na fase de LGPD.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
