import { redirect } from "next/navigation";

import { createPlatformUserAction } from "@/app/(app)/platform/users/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUserContext } from "@/lib/auth/current";
import {
  canManageAdminUsers,
  canManagePlatformUsers,
  platformRoleLabel,
} from "@/lib/auth/platform-permissions";
import { getWorkspaceRoleDefinition } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";

type PlatformUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

const errorMessages: Record<string, string> = {
  invalid: "Revise os campos e tente novamente.",
  role: "Seu papel não permite criar esse tipo de usuário.",
  workspace: "Selecione um workspace para criar cliente.",
  email: "Esse email já existe.",
};

export default async function PlatformUsersPage({ searchParams }: PlatformUsersPageProps) {
  const context = await getCurrentUserContext();
  if (!canManagePlatformUsers(context.user)) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const error = firstParam(params.error);
  const created = firstParam(params.created);
  const canCreateAdmins = canManageAdminUsers(context.user);
  const roleOptions = [
    ...(canCreateAdmins
      ? [
          { value: "ADMIN_MASTER", label: "Admin Master" },
          { value: "ADMIN_LIMITED", label: "Admin Limitado" },
        ]
      : []),
    { value: "TRAFFIC_MANAGER", label: "Gestor de Tráfego" },
    { value: "USER", label: "Cliente" },
  ];

  const [users, workspaces] = context.isDemoMode
    ? [[], []]
    : await Promise.all([
        prisma.user.findMany({
          orderBy: { createdAt: "desc" },
          take: 80,
          select: {
            id: true,
            name: true,
            email: true,
            platformRole: true,
            createdAt: true,
            memberships: {
              include: {
                workspace: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        }),
        prisma.workspace.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-caption text-[var(--text-tertiary)]">Plataforma</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Usuários</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)]">
            Crie acessos internos W3 e clientes read-only vinculados a uma marca.
          </p>
        </div>
      </section>

      {created ? (
        <p className="rounded-md bg-[var(--success-bg)] px-4 py-3 text-sm text-[var(--success)]">
          Usuário criado com acesso real.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger)]">
          {errorMessages[error] ?? "Não conseguimos criar o usuário."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Novo usuário</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createPlatformUserAction} className="grid gap-4 lg:grid-cols-4">
            <Input label="Nome" name="name" required />
            <Input label="Email" name="email" type="email" required />
            <Input label="Senha temporária" name="password" type="password" required />
            <label className="grid gap-2">
              <span className="text-caption text-[var(--text-tertiary)]">Papel</span>
              <select
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="platformRole"
                defaultValue="USER"
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 lg:col-span-3">
              <span className="text-caption text-[var(--text-tertiary)]">
                Workspace do cliente
              </span>
              <select
                className="h-10 rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm"
                name="workspaceId"
                defaultValue={context.currentWorkspace.id}
              >
                <option value="">Sem workspace para usuário interno</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <input name="membershipRole" type="hidden" value="CLIENT" />
            </label>
            <Button className="self-end" type="submit">
              Criar usuário
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Usuários atuais</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border-strong)] bg-[var(--bg-elevated)] text-caption text-[var(--text-tertiary)]">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Papel W3</th>
                <th className="px-4 py-3">Workspaces</th>
                <th className="px-4 py-3">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-b border-[var(--border-subtle)]" key={user.id}>
                  <td className="px-4 py-3 font-medium">{user.name ?? "-"}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{user.email}</td>
                  <td className="px-4 py-3 font-mono">{platformRoleLabel(user.platformRole)}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">
                    {user.memberships.length
                      ? user.memberships
                          .map(
                            (membership) =>
                              `${membership.workspace.name} · ${
                                getWorkspaceRoleDefinition(membership.role).label
                              }`,
                          )
                          .join(", ")
                      : "Interno W3"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {user.createdAt.toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
