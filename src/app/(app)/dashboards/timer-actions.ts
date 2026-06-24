"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { getCurrentUserContext } from "@/lib/auth/current";
import {
  canUseAccountTimer,
  canViewAccountTimerLogs,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db/prisma";
import { computeDurationSeconds } from "@/lib/timer/duration";

const noteSchema = z.string().trim().max(500).optional();

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Resolves the actor's REAL membership role on a workspace (never the synthetic
 * OWNER injected for internal admins), used for OWNER-gated log access.
 */
async function realMembershipRole(userId: string, workspaceId: string) {
  const membership = await prisma.membership.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true },
  });
  return membership?.role ?? null;
}

/** Start the review timer for the currently-selected brand. */
export async function startTimerAction() {
  const context = await getCurrentUserContext();

  if (!canUseAccountTimer(context.user)) {
    redirect("/dashboards?timerError=forbidden");
  }

  try {
    await prisma.accountReviewSession.create({
      data: {
        workspaceId: context.currentWorkspace.id,
        userId: context.user.id,
      },
    });
  } catch (error: unknown) {
    // P2002 = the partial unique index fired: a session is already running for
    // this user (possibly on another brand). Surface a friendly message.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect("/dashboards?timerError=active");
    }
    throw error;
  }

  await logAudit({
    action: "account_timer.start",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "account_review_session",
  });

  revalidatePath("/dashboards");
}

/** Stop the user's running timer, recording duration and an optional note. */
export async function stopTimerAction(formData: FormData) {
  const context = await getCurrentUserContext();

  if (!canUseAccountTimer(context.user)) {
    redirect("/dashboards?timerError=forbidden");
  }

  const sessionId = getString(formData, "sessionId");
  const parsedNote = noteSchema.safeParse(
    getString(formData, "note") || undefined,
  );
  if (!sessionId || !parsedNote.success) {
    redirect("/dashboards?timerError=invalid");
  }

  const session = await prisma.accountReviewSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true, startedAt: true, endedAt: true },
  });

  // Only the owner of the running session may stop it, and only once.
  if (!session || session.userId !== context.user.id || session.endedAt) {
    redirect("/dashboards?timerError=invalid");
  }

  const endedAt = new Date();
  await prisma.accountReviewSession.update({
    where: { id: session.id },
    data: {
      endedAt,
      durationSeconds: computeDurationSeconds(session.startedAt, endedAt),
      note:
        parsedNote.data && parsedNote.data.length > 0 ? parsedNote.data : null,
    },
  });

  await logAudit({
    action: "account_timer.stop",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "account_review_session",
    resourceId: session.id,
  });

  revalidatePath("/dashboards");
}

/** Delete a logged session. Restricted to Admin Master or the brand OWNER. */
export async function deleteSessionAction(formData: FormData) {
  const context = await getCurrentUserContext();

  const sessionId = getString(formData, "sessionId");
  if (!sessionId) {
    redirect("/dashboards/tempo?error=invalid");
  }

  const session = await prisma.accountReviewSession.findUnique({
    where: { id: sessionId },
    select: { id: true, workspaceId: true },
  });
  if (!session) {
    redirect("/dashboards/tempo?error=invalid");
  }

  const role = await realMembershipRole(context.user.id, session.workspaceId);
  if (!canViewAccountTimerLogs(context.user, role)) {
    redirect("/dashboards/tempo?error=forbidden");
  }

  await prisma.accountReviewSession.delete({ where: { id: session.id } });

  await logAudit({
    action: "account_timer.delete",
    userId: context.user.id,
    workspaceId: session.workspaceId,
    resourceType: "account_review_session",
    resourceId: session.id,
  });

  revalidatePath("/dashboards/tempo");
}
