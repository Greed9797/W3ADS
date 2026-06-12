"use server";

import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAudit } from "@/lib/audit/log";
import { getStrictCookieOptions } from "@/lib/auth/cookies";
import { getCurrentUserContext } from "@/lib/auth/current";
import { hashPassword } from "@/lib/auth/password";
import { canManageMembers } from "@/lib/auth/permissions";
import { isAdminMaster } from "@/lib/auth/platform-permissions";
import { prisma } from "@/lib/db/prisma";

const VALID_ROLES = ["ADMIN", "VIEWER", "CLIENT"] as const;

const createMemberSchema = z.object({
  name: z.string().min(2, "Informe o nome").max(120),
  email: z.string().email("Email inválido").max(160),
  password: z.string().min(8).max(120).optional().or(z.literal("")),
  role: z.enum(VALID_ROLES),
});

const FLASH_COOKIE = "w3ads_member_created";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function generatePassword() {
  return `w3-${randomBytes(4).toString("hex")}`;
}

export async function createMemberAction(formData: FormData) {
  const context = await getCurrentUserContext();

  // Authorize on a REAL membership row for the active workspace (or platform
  // Admin Master). context.currentMembership can be a SYNTHETIC OWNER injected
  // for internal admins on the cookie-selected workspace, which would let a
  // non-Master internal admin create/reset members in a brand they don't
  // belong to.
  const realMembership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId: context.user.id,
        workspaceId: context.currentWorkspace.id,
      },
    },
    select: { role: true },
  });
  if (
    !isAdminMaster(context.user) &&
    !(realMembership != null && canManageMembers(realMembership.role))
  ) {
    redirect("/workspace/members?error=forbidden");
  }

  const parsed = createMemberSchema.safeParse({
    name: getString(formData, "name"),
    email: getString(formData, "email"),
    password: getString(formData, "password") || undefined,
    role: getString(formData, "role"),
  });

  if (!parsed.success) {
    redirect("/workspace/members?error=invalid");
  }

  // Only OWNER (or platform Admin Master) may grant ADMIN — prevent an ADMIN
  // from creating another ADMIN at their own level (peer privilege escalation).
  if (
    parsed.data.role === "ADMIN" &&
    !isAdminMaster(context.user) &&
    realMembership?.role !== "OWNER"
  ) {
    redirect("/workspace/members?error=forbidden");
  }

  const { name, email, role } = parsed.data;
  const password =
    parsed.data.password && parsed.data.password.length > 0
      ? parsed.data.password
      : generatePassword();
  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  let resultEmail = email;

  await prisma.$transaction(async (tx) => {
    let userId = existing?.id;

    if (!userId) {
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          platformRole: "USER",
          emailVerified: new Date(),
        },
        select: { id: true, email: true },
      });
      userId = created.id;
      resultEmail = created.email;
    } else {
      // Atualiza senha do usuário existente (admin pode resetar)
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, name },
      });
    }

    await tx.membership.upsert({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: context.currentWorkspace.id,
        },
      },
      update: { role },
      create: {
        userId,
        workspaceId: context.currentWorkspace.id,
        role,
      },
    });
  });

  await logAudit({
    action: existing ? "workspace.member.reset" : "workspace.member.create",
    userId: context.user.id,
    workspaceId: context.currentWorkspace.id,
    resourceType: "membership",
    metadata: { email: resultEmail, role, reused: Boolean(existing) },
  });

  // Flash message com senha — visível apenas no próximo carregamento da página
  const cookieStore = await cookies();
  cookieStore.set(
    FLASH_COOKIE,
    JSON.stringify({ email: resultEmail, password, role }),
    {
      ...getStrictCookieOptions({
        path: "/workspace/members",
        maxAge: 60,
      }),
    },
  );

  redirect("/workspace/members?created=1");
}

export async function consumeMemberCreatedFlash() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(FLASH_COOKIE)?.value;
  if (!raw) return null;

  cookieStore.delete(FLASH_COOKIE);

  try {
    const parsed = JSON.parse(raw) as {
      email: string;
      password: string;
      role: string;
    };
    return parsed;
  } catch {
    return null;
  }
}
