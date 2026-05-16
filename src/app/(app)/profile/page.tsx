import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUserContext } from "@/lib/auth/current";

export default async function ProfilePage() {
  const context = await getCurrentUserContext();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-[var(--text-secondary)]">
        <p>Nome: {context.user.name}</p>
        <p>Email: {context.user.email}</p>
      </CardContent>
    </Card>
  );
}
