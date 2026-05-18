import { createWorkspaceAction, updateWorkspaceSettingsAction } from "@/app/(app)/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCurrentUserContext } from "@/lib/auth/current";
import {
  canCreateWorkspace,
  canManageWorkspaceSettings,
  getWorkspaceRoleDefinition,
} from "@/lib/auth/permissions";

type WorkspaceSettingsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WorkspaceSettingsPage({ searchParams }: WorkspaceSettingsPageProps) {
  const context = await getCurrentUserContext();
  const params = await searchParams;
  const canEditWorkspace = canManageWorkspaceSettings(context.currentMembership.role);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-caption text-[var(--text-tertiary)]">Conta e workspaces</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">
          Modelo Adstart de acesso
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">
          Pessoas entram com uma conta pessoal, recebem um papel em cada workspace e os
          conectores, tokens e métricas ficam sempre vinculados ao workspace ativo.
        </p>
      </div>

      {params.saved ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Workspace atualizado.
        </p>
      ) : null}
      {params.created ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Novo workspace criado.
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-md bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          Não conseguimos salvar esses dados. Revise as informações e tente novamente.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Workspace atual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-caption text-[var(--text-tertiary)]">Nome</p>
                <p className="mt-1 font-medium">{context.currentWorkspace.name}</p>
              </div>
              <div>
                <p className="text-caption text-[var(--text-tertiary)]">Slug</p>
                <p className="mt-1 font-mono text-sm">{context.currentWorkspace.slug}</p>
              </div>
              <div>
                <p className="text-caption text-[var(--text-tertiary)]">Seu papel</p>
                <p className="mt-1 font-mono text-sm">{context.currentMembership.role}</p>
              </div>
            </div>

            {canEditWorkspace ? (
              <form action={updateWorkspaceSettingsAction} className="grid gap-4 md:grid-cols-[1fr_auto]">
                <Input
                  defaultValue={context.currentWorkspace.name}
                  label="Nome do workspace"
                  name="name"
                  required
                />
                <Button className="self-end" type="submit" variant="secondary">
                  Salvar ajustes
                </Button>
              </form>
            ) : (
              <p className="rounded-md bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--warning)]">
                Apenas Owners alteram os ajustes centrais do workspace. Admins operam
                conectores, membros e dashboards.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Criar workspace</CardTitle>
          </CardHeader>
          <CardContent>
            {canCreateWorkspace() ? (
              <form action={createWorkspaceAction} className="space-y-4">
                <Input label="Nome" name="name" placeholder="Loja da Maria" required />
                <Button type="submit">Criar como Owner</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workspaces da sua conta</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
                <th className="px-4 py-3">Workspace</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Seu papel</th>
                <th className="px-4 py-3">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {context.memberships.map((membership) => {
                const role = getWorkspaceRoleDefinition(membership.role);

                return (
                  <tr className="border-b border-[var(--border-subtle)]" key={membership.id}>
                    <td className="px-4 py-3 font-medium">{membership.workspace.name}</td>
                    <td className="px-4 py-3 font-mono text-[var(--text-secondary)]">
                      {membership.workspace.slug}
                    </td>
                    <td className="px-4 py-3 font-mono">{role.label}</td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">{role.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
