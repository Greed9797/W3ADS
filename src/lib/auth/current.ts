import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";

import { auth } from "./auth";

export async function getCurrentUserContext() {
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

  const currentMembership =
    user.memberships.find((membership) => membership.workspaceId === selectedWorkspaceId) ??
    user.memberships[0];

  if (!currentMembership) {
    redirect("/sign-up");
  }

  return {
    user,
    memberships: user.memberships,
    currentMembership,
    currentWorkspace: currentMembership.workspace,
  };
}
