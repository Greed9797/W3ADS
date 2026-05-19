import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole, PlatformRole, WorkspacePlan } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import { auth } from "./auth";
import { isAuthDisabled } from "./mode";
import { isAdminLimited, isAdminMaster, isTrafficManager } from "./platform-permissions";

type CurrentWorkspace = {
  id: string;
  name: string;
  slug: string;
  plan: WorkspacePlan;
  createdAt: Date;
  updatedAt: Date;
};

type CurrentMembership = {
  id: string;
  userId: string;
  workspaceId: string;
  role: MemberRole;
  createdAt: Date;
  workspace: CurrentWorkspace;
};

const demoWorkspace: CurrentWorkspace = {
  id: "demo-workspace",
  name: "Workspace Demo",
  slug: "workspace-demo",
  plan: "FREE" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const demoMembership: CurrentMembership = {
  id: "demo-membership",
  userId: "demo-user",
  workspaceId: demoWorkspace.id,
  role: "OWNER" as const,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  workspace: demoWorkspace,
};

export type CurrentUserContext = {
  user: {
    id: string;
    email: string;
    name: string | null;
    image?: string | null;
    platformRole: PlatformRole;
  };
  memberships: CurrentMembership[];
  currentMembership: CurrentMembership;
  currentWorkspace: CurrentWorkspace;
  isDemoMode: boolean;
};

function getDemoUserContext(): CurrentUserContext {
  return {
    user: {
      id: "demo-user",
      email: "demo@adstartw3.local",
      name: "Equipe W3",
      image: null,
      platformRole: "ADMIN_MASTER",
    },
    memberships: [demoMembership],
    currentMembership: demoMembership,
    currentWorkspace: demoWorkspace,
    isDemoMode: true,
  };
}

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  if (isAuthDisabled()) {
    return getDemoUserContext();
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get("adstart_workspace_id")?.value;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        include: {
          workspace: true,
        },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  let currentMembership =
    user.memberships.find((membership) => membership.workspaceId === selectedWorkspaceId) ??
    user.memberships[0];

  const platformUser = { platformRole: user.platformRole };
  const syntheticRole: MemberRole = isTrafficManager(platformUser) ? "VIEWER" : "OWNER";
  const canUseSyntheticWorkspace =
    isAdminMaster(platformUser) || isAdminLimited(platformUser) || isTrafficManager(platformUser);

  if (!currentMembership && canUseSyntheticWorkspace && selectedWorkspaceId) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: selectedWorkspaceId },
    });

    if (workspace) {
      currentMembership = {
        id: `platform-admin:${workspace.id}`,
        userId: user.id,
        workspaceId: workspace.id,
        role: syntheticRole,
        createdAt: new Date(0),
        workspace,
      };
    }
  }

  if (
    canUseSyntheticWorkspace &&
    selectedWorkspaceId &&
    currentMembership?.workspaceId !== selectedWorkspaceId
  ) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: selectedWorkspaceId },
    });

    if (workspace) {
      currentMembership = {
        id: `platform-admin:${workspace.id}`,
        userId: user.id,
        workspaceId: workspace.id,
        role: syntheticRole,
        createdAt: new Date(0),
        workspace,
      };
    }
  }

  if (!currentMembership && canUseSyntheticWorkspace) {
    const workspace = await prisma.workspace.findFirst({
      orderBy: { createdAt: "asc" },
    });

    if (workspace) {
      currentMembership = {
        id: `platform-admin:${workspace.id}`,
        userId: user.id,
        workspaceId: workspace.id,
        role: syntheticRole,
        createdAt: new Date(0),
        workspace,
      };
    }
  }

  if (!currentMembership) {
    redirect("/sign-up");
  }

  const memberships =
    canUseSyntheticWorkspace &&
    !user.memberships.some((membership) => membership.workspaceId === currentMembership.workspaceId)
      ? [currentMembership, ...user.memberships]
      : user.memberships;

  return {
    user,
    memberships,
    currentMembership,
    currentWorkspace: currentMembership.workspace,
    isDemoMode: false,
  };
}
