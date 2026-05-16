"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit/log";
import { auth, signOut } from "@/lib/auth/auth";
import { getCurrentUserContext } from "@/lib/auth/current";
import { assertCanManageMembers } from "@/lib/auth/permissions";
import { workspaceInviteSchema } from "@/lib/auth/schemas";
import { createWorkspaceInvite } from "@/lib/auth/service";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function switchWorkspaceAction(formData: FormData) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const workspaceId = getString(formData, "workspaceId");
  const context = await getCurrentUserContext();
  const membership = context.memberships.find((item) => item.workspaceId === workspaceId);

  if (!membership) {
    redirect("/dashboard");
  }

  const cookieStore = await cookies();
  cookieStore.set("adstart_workspace_id", workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  await logAudit({
    action: "workspace.switch",
    userId: session.user.id,
    workspaceId,
    resourceType: "workspace",
    resourceId: workspaceId,
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function inviteMemberAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageMembers(context.currentMembership.role);

  const parsed = workspaceInviteSchema.safeParse({
    email: getString(formData, "email"),
    role: getString(formData, "role"),
  });

  if (!parsed.success) {
    redirect("/workspace/members?error=invalid");
  }

  await createWorkspaceInvite({
    workspaceId: context.currentWorkspace.id,
    invitedById: context.user.id,
    values: parsed.data,
  });

  redirect("/workspace/members?invited=1");
}
