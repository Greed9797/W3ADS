import { inviteMemberAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { canManageMembers } from "@/lib/auth/permissions";
import { getCurrentUserContext } from "@/lib/auth/current";
import { prisma } from "@/lib/db/prisma";

type MembersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const canInvite = canManageMembers(context.currentMembership.role);
  const workspaceMembers = context.isDemoMode
    ? context.memberships.map((membership) => ({
        ...membership,
        user: {
          id: context.user.id,
          name: context.user.name,
          email: context.user.email,
        },
      }))
    : await prisma.membership.findMany({
        where: { workspaceId: context.currentWorkspace.id },
        orderBy: { createdAt: "asc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-caption text-[var(--text-tertiary)]">Workspace</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Membros</h2>
      </div>
      {params.invited ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Convite criado. O envio por email fica ativo quando `RESEND_API_KEY` estiver configurada.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Membros atuais</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Papel</th>
              </tr>
            </thead>
            <tbody>
              {workspaceMembers.map((membership) => (
                <tr className="border-b border-[var(--border-subtle)]" key={membership.id}>
                  <td className="px-4 py-3 font-medium">{membership.user.name ?? "-"}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {membership.user.email}
                  </td>
                  <td className="px-4 py-3 font-mono">{membership.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {canInvite ? (
        <Card>
          <CardHeader>
            <CardTitle>Convidar colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={inviteMemberAction} className="grid gap-4 md:grid-cols-[1fr_160px_auto]">
              <Input label="Email" name="email" type="email" required />
              <label className="grid gap-2">
                <span className="text-caption text-[var(--text-tertiary)]">Papel</span>
                <select
                  className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                  name="role"
                  defaultValue="VIEWER"
                >
                  <option value="VIEWER">Viewer</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <Button className="self-end" type="submit">
                Convidar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
