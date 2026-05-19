"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logAudit } from "@/lib/audit/log";
import { auth, signOut } from "@/lib/auth/auth";
import { getCurrentUserContext } from "@/lib/auth/current";
import {
  assertCanChangeMemberRole,
  assertCanManageMembers,
  assertCanManageWorkspaceSettings,
  assertCanRemoveMember,
} from "@/lib/auth/permissions";
import {
  workspaceCreateSchema,
  workspaceInviteSchema,
  workspaceMemberRemoveSchema,
  workspaceMemberRoleSchema,
  workspaceSettingsSchema,
} from "@/lib/auth/schemas";
import { createWorkspaceForUser, createWorkspaceInvite } from "@/lib/auth/service";
import { isInternalW3User, isTrafficManager } from "@/lib/auth/platform-permissions";
import { prisma } from "@/lib/db/prisma";

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

  if (!membership && !isInternalW3User(context.user)) {
    redirect("/dashboard");
  }

  if (context.currentMembership.role === "CLIENT") {
    redirect("/dashboard");
  }

  if (!membership) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      redirect("/dashboard");
    }
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

export async function createWorkspaceAction(formData: FormData) {
  const context = await getCurrentUserContext();
  if (context.currentMembership.role === "CLIENT" || isTrafficManager(context.user)) {
    redirect("/workspace/settings?error=forbidden");
  }

  const parsed = workspaceCreateSchema.safeParse({
    name: getString(formData, "name"),
  });

  if (!parsed.success) {
    redirect("/workspace/settings?error=invalid-workspace");
  }

  if (context.isDemoMode) {
    redirect("/workspace/settings?created=demo");
  }

  const workspace = await createWorkspaceForUser({
    userId: context.user.id,
    values: parsed.data,
  });

  const cookieStore = await cookies();
  cookieStore.set("adstart_workspace_id", workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect("/dashboard?workspaceCreated=1");
}

export async function updateWorkspaceSettingsAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageWorkspaceSettings(context.currentMembership.role);

  const parsed = workspaceSettingsSchema.safeParse({
    name: getString(formData, "name"),
  });

  if (!parsed.success) {
    redirect("/workspace/settings?error=invalid-workspace");
  }

  if (context.isDemoMode) {
    redirect("/workspace/settings?saved=demo");
  }

  const workspace = await prisma.workspace.update({
    where: { id: context.currentWorkspace.id },
    data: {
      name: parsed.data.name,
    },
  });

  await logAudit({
    action: "workspace.update",
    userId: context.user.id,
    workspaceId: workspace.id,
    resourceType: "workspace",
    resourceId: workspace.id,
    metadata: {
      name: workspace.name,
    },
  });

  redirect("/workspace/settings?saved=1");
}

export async function updateMemberRoleAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageMembers(context.currentMembership.role);

  const parsed = workspaceMemberRoleSchema.safeParse({
    membershipId: getString(formData, "membershipId"),
    role: getString(formData, "role"),
  });

  if (!parsed.success) {
    redirect("/workspace/members?error=invalid");
  }

  if (context.isDemoMode) {
    redirect("/workspace/members?updated=demo");
  }

  const target = await prisma.membership.findFirst({
    where: {
      id: parsed.data.membershipId,
      workspaceId: context.currentWorkspace.id,
    },
    select: {
      id: true,
      role: true,
      userId: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!target) {
    redirect("/workspace/members?error=not-found");
  }

  assertCanChangeMemberRole({
    actorRole: context.currentMembership.role,
    actorMembershipId: context.currentMembership.id,
    targetMembershipId: target.id,
    targetCurrentRole: target.role,
    targetNextRole: parsed.data.role,
  });

  await prisma.membership.update({
    where: { id: target.id },
    data: { role: parsed.data.role },
  });

  await logAudit({
    action: "workspace.member.role_update",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "membership",
    resourceId: target.id,
    metadata: {
      targetUserId: target.userId,
      targetEmail: target.user.email,
      oldRole: target.role,
      newRole: parsed.data.role,
    },
  });

  redirect("/workspace/members?updated=1");
}

export async function removeMemberAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManageMembers(context.currentMembership.role);

  const parsed = workspaceMemberRemoveSchema.safeParse({
    membershipId: getString(formData, "membershipId"),
  });

  if (!parsed.success) {
    redirect("/workspace/members?error=invalid");
  }

  if (context.isDemoMode) {
    redirect("/workspace/members?removed=demo");
  }

  const target = await prisma.membership.findFirst({
    where: {
      id: parsed.data.membershipId,
      workspaceId: context.currentWorkspace.id,
    },
    select: {
      id: true,
      role: true,
      userId: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!target) {
    redirect("/workspace/members?error=not-found");
  }

  assertCanRemoveMember({
    actorRole: context.currentMembership.role,
    actorMembershipId: context.currentMembership.id,
    targetMembershipId: target.id,
    targetRole: target.role,
  });

  await prisma.membership.delete({
    where: { id: target.id },
  });

  await logAudit({
    action: "workspace.member.remove",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "membership",
    resourceId: target.id,
    metadata: {
      targetUserId: target.userId,
      targetEmail: target.user.email,
      oldRole: target.role,
    },
  });

  redirect("/workspace/members?removed=1");
}
