import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole, PlatformRole, WorkspacePlan } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

import { auth } from "./auth";
import { getDevBypassEmail } from "./mode";
import {
  isAdminLimited,
  isAdminMaster,
  isTrafficManager,
} from "./platform-permissions";

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
};

async function resolveUserId(): Promise<string> {
  const bypassEmail = getDevBypassEmail();
  if (bypassEmail) {
    const user = await prisma.user.findUnique({
      where: { email: bypassEmail },
      select: { id: true },
    });

    if (!user) {
      throw new Error(
        `DEV_AUTH_BYPASS_EMAIL='${bypassEmail}' configured but no user with that email exists. Run \`npm run db:seed\` first.`,
      );
    }

    return user.id;
  }

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

export type ConnectorWorkspaceAccess = {
  user: { id: string; platformRole: PlatformRole };
  workspace: CurrentWorkspace;
  role: MemberRole;
};

/**
 * Resolves which workspace an OAuth connector flow must attach to — using the
 * workspaceId carried in the HMAC-signed OAuth state, NOT the request cookie.
 *
 * The workspace selection cookie is dropped by browsers on the cross-site
 * redirect back from Google/Shopify/Nuvemshop, so `getCurrentUserContext`
 * falls back to the user's first workspace. Connector callbacks must instead
 * trust the signed state and re-validate access here against the DB.
 *
 * Returns null when the workspace does not exist or the user has no
 * connector-operate rights on it.
 */
export async function resolveConnectorWorkspaceAccess(input: {
  userId: string;
  workspaceId: string;
}): Promise<ConnectorWorkspaceAccess | null> {
  const [user, workspace, membership] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, platformRole: true },
    }),
    prisma.workspace.findUnique({ where: { id: input.workspaceId } }),
    prisma.membership.findFirst({
      where: { userId: input.userId, workspaceId: input.workspaceId },
      select: { role: true },
    }),
  ]);

  if (!user || !workspace) {
    return null;
  }

  const platformUser = { platformRole: user.platformRole };
  const isInternal =
    isAdminMaster(platformUser) ||
    isAdminLimited(platformUser) ||
    isTrafficManager(platformUser);

  // Internal/admin users may not hold an explicit membership row but still
  // operate connectors. Synthesize OWNER for them; otherwise require a real
  // membership with operate rights.
  const role: MemberRole | null =
    membership?.role ?? (isInternal ? "OWNER" : null);
  if (role === null) {
    return null;
  }

  return {
    user: { id: user.id, platformRole: user.platformRole },
    workspace,
    role,
  };
}

export async function getCurrentUserContext(): Promise<CurrentUserContext> {
  const userId = await resolveUserId();

  const cookieStore = await cookies();
  const selectedWorkspaceId = cookieStore.get("adstart_workspace_id")?.value;

  const user = await prisma.user.findUnique({
    where: { id: userId },
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
    user.memberships.find(
      (membership) => membership.workspaceId === selectedWorkspaceId,
    ) ?? user.memberships[0];

  const platformUser = { platformRole: user.platformRole };
  const syntheticRole: MemberRole = isTrafficManager(platformUser)
    ? "VIEWER"
    : "OWNER";
  const canUseSyntheticWorkspace =
    isAdminMaster(platformUser) ||
    isAdminLimited(platformUser) ||
    isTrafficManager(platformUser);

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
    !user.memberships.some(
      (membership) => membership.workspaceId === currentMembership.workspaceId,
    )
      ? [currentMembership, ...user.memberships]
      : user.memberships;

  return {
    user,
    memberships,
    currentMembership,
    currentWorkspace: currentMembership.workspace,
  };
}
