import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] px-4 py-10 text-[var(--text-primary)]">
      <Card className="mx-auto max-w-3xl">
        <CardHeader>
          <CardTitle>Termos de uso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
          <p>
            Estes termos sao um rascunho operacional para o beta privado do Adstart W3.
            A versao juridica revisada entra na fase de LGPD e beta launch.
          </p>
          <p>
            Ao usar a plataforma, voce confirma que tem autorizacao para conectar contas
            de anuncios, e-commerce e colaboradores ao workspace da sua empresa.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
