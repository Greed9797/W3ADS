import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";

export default async function WorkspaceSettingsPage() {
  const context = await getCurrentUserContext();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajustes do workspace</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p>Nome: {context.currentWorkspace.name}</p>
        <p>Slug: {context.currentWorkspace.slug}</p>
        <p>Plano: {context.currentWorkspace.plan}</p>
      </CardContent>
    </Card>
  );
}
