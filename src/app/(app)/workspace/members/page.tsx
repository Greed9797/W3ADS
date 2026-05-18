import {
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  canChangeMemberRole,
  canManageMembers,
  canRemoveMember,
  getWorkspaceRoleDefinition,
  getWorkspaceRoleOptions,
} from "@/lib/auth/permissions";
import { getCurrentUserContext } from "@/lib/auth/current";
import { prisma } from "@/lib/db/prisma";

type MembersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MembersPage({ searchParams }: MembersPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const canInvite = canManageMembers(context.currentMembership.role);
  const roleOptions = getWorkspaceRoleOptions();
  const assignableRoles = roleOptions.filter((role) => role.role !== "OWNER");
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
      {params.updated ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Papel atualizado no workspace.
        </p>
      ) : null}
      {params.removed ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Membro removido do workspace.
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-md bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          Não conseguimos concluir a alteração. Confira seu papel e tente novamente.
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Modelo de acesso</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {roleOptions.map((role) => (
            <div
              className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4"
              key={role.role}
            >
              <p className="font-semibold text-[var(--text-primary)]">{role.label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                {role.description}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Membros atuais</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Permissão</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {workspaceMembers.map((membership) => {
                const roleDefinition = getWorkspaceRoleDefinition(membership.role);
                const canChange = canChangeMemberRole({
                  actorRole: context.currentMembership.role,
                  actorMembershipId: context.currentMembership.id,
                  targetMembershipId: membership.id,
                  targetCurrentRole: membership.role,
                  targetNextRole: membership.role === "ADMIN" ? "VIEWER" : "ADMIN",
                });
                const canRemove = canRemoveMember({
                  actorRole: context.currentMembership.role,
                  actorMembershipId: context.currentMembership.id,
                  targetMembershipId: membership.id,
                  targetRole: membership.role,
                });

                return (
                  <tr className="border-b border-[var(--border-subtle)]" key={membership.id}>
                    <td className="px-4 py-3 font-medium">{membership.user.name ?? "-"}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {membership.user.email}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-[var(--radius-pill)] bg-[var(--bg-elevated)] px-3 py-1 font-mono text-[0.75rem]">
                        {roleDefinition.label}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-[var(--text-secondary)]">
                      {roleDefinition.description}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {canChange ? (
                          <form action={updateMemberRoleAction} className="flex items-center gap-2">
                            <input name="membershipId" type="hidden" value={membership.id} />
                            <select
                              className="h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-sm"
                              defaultValue={membership.role}
                              name="role"
                            >
                              {assignableRoles.map((role) => (
                                <option key={role.role} value={role.role}>
                                  {role.label}
                                </option>
                              ))}
                            </select>
                            <Button size="sm" type="submit" variant="secondary">
                              Salvar
                            </Button>
                          </form>
                        ) : null}
                        {canRemove ? (
                          <form action={removeMemberAction}>
                            <input name="membershipId" type="hidden" value={membership.id} />
                            <Button size="sm" type="submit" variant="ghost">
                              Remover
                            </Button>
                          </form>
                        ) : null}
                        {!canChange && !canRemove ? (
                          <span className="text-sm text-[var(--text-tertiary)]">
                            Sem ações
                          </span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                  {assignableRoles.map((role) => (
                    <option key={role.role} value={role.role}>
                      {role.label}
                    </option>
                  ))}
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
