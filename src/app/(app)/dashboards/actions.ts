"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUserContext } from "@/lib/auth/current";
import { assertCanEditDashboards } from "@/lib/auth/permissions";
import { assertCanManagePlatformUsers } from "@/lib/auth/platform-permissions";
import {
  buildDashboardDraft,
  layoutToPrismaJson,
  parseDashboardWidgets,
  widgetsToPrismaJson,
} from "@/lib/dashboards/store";
import { prisma } from "@/lib/db/prisma";
import {
  addWidget,
  createDashboardLayout,
  moveWidget,
  removeWidget,
  type DashboardWidgetId,
} from "@/lib/metrics/kpi-catalog";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function getAllStrings(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .filter((value): value is string => typeof value === "string");
}

function getWidgetId(formData: FormData) {
  return getString(formData, "widgetId") as DashboardWidgetId;
}

async function loadDashboardForEdit(id: string, workspaceId: string) {
  const dashboard = await prisma.dashboard.findFirst({
    where: {
      id,
      workspaceId,
    },
  });

  if (!dashboard) {
    redirect("/dashboards");
  }

  return dashboard;
}

export async function createDashboardAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const name = getString(formData, "name");
  const widgetIds = getAllStrings(formData, "widgets");

  const draft = buildDashboardDraft({
    name,
    ownerId: context.user.id,
    widgetIds,
  });

  const dashboard = await prisma.dashboard.create({
    data: {
      workspaceId: context.currentWorkspace.id,
      ownerId: context.user.id,
      name: draft.name,
      isDefault: false,
      layout: layoutToPrismaJson(draft.layout),
      widgets: widgetsToPrismaJson(draft.widgets),
    },
  });

  redirect(`/dashboards/${dashboard.id}?created=1`);
}

export async function addWidgetAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const dashboardId = getString(formData, "dashboardId");
  const widgetId = getWidgetId(formData);

  const dashboard = await loadDashboardForEdit(
    dashboardId,
    context.currentWorkspace.id,
  );
  const widgets = addWidget(parseDashboardWidgets(dashboard.widgets), widgetId);

  await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: {
      widgets: widgetsToPrismaJson(widgets),
      layout: layoutToPrismaJson(createDashboardLayout(widgets)),
    },
  });

  revalidatePath(`/dashboards/${dashboardId}`);
  redirect(`/dashboards/${dashboardId}?updated=1`);
}

export async function removeWidgetAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const dashboardId = getString(formData, "dashboardId");
  const instanceId = getString(formData, "instanceId");

  const dashboard = await loadDashboardForEdit(
    dashboardId,
    context.currentWorkspace.id,
  );
  const widgets = removeWidget(
    parseDashboardWidgets(dashboard.widgets),
    instanceId,
  );

  await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: {
      widgets: widgetsToPrismaJson(widgets),
      layout: layoutToPrismaJson(createDashboardLayout(widgets)),
    },
  });

  revalidatePath(`/dashboards/${dashboardId}`);
  redirect(`/dashboards/${dashboardId}?updated=1`);
}

export async function moveWidgetAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const dashboardId = getString(formData, "dashboardId");
  const instanceId = getString(formData, "instanceId");
  const direction = getString(formData, "direction") === "down" ? "down" : "up";

  const dashboard = await loadDashboardForEdit(
    dashboardId,
    context.currentWorkspace.id,
  );
  const widgets = moveWidget(
    parseDashboardWidgets(dashboard.widgets),
    instanceId,
    direction,
  );

  await prisma.dashboard.update({
    where: { id: dashboard.id },
    data: {
      widgets: widgetsToPrismaJson(widgets),
      layout: layoutToPrismaJson(createDashboardLayout(widgets)),
    },
  });

  revalidatePath(`/dashboards/${dashboardId}`);
  redirect(`/dashboards/${dashboardId}?updated=1`);
}

export async function setDefaultDashboardAction(formData: FormData) {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const dashboardId = getString(formData, "dashboardId");

  await prisma.$transaction([
    prisma.dashboard.updateMany({
      where: {
        workspaceId: context.currentWorkspace.id,
      },
      data: {
        isDefault: false,
      },
    }),
    prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        isDefault: true,
      },
    }),
  ]);

  revalidatePath("/dashboards");
  redirect("/dashboards?default=1");
}

export async function duplicateDefaultDashboardAction() {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const widgetIds = [
    "revenue",
    "spend",
    "roas_blended",
    "orders",
    "revenue_spend_line",
    "top_campaigns",
    "funnel",
  ];

  const draft = buildDashboardDraft({
    name: "Cópia Performance Geral",
    ownerId: context.user.id,
    widgetIds,
  });

  const dashboard = await prisma.dashboard.create({
    data: {
      workspaceId: context.currentWorkspace.id,
      ownerId: context.user.id,
      name: draft.name,
      isDefault: false,
      layout: layoutToPrismaJson(draft.layout),
      widgets: widgetsToPrismaJson(draft.widgets),
    },
  });

  redirect(`/dashboards/${dashboard.id}?created=1`);
}

export async function ensureDefaultDashboardAction() {
  const context = await getCurrentUserContext();
  assertCanManagePlatformUsers(context.user);
  assertCanEditDashboards(context.currentMembership.role);

  const existing = await prisma.dashboard.findFirst({
    where: {
      workspaceId: context.currentWorkspace.id,
      isDefault: true,
    },
  });

  if (existing) {
    redirect(`/dashboards/${existing.id}`);
  }

  const draft = buildDashboardDraft({
    name: "Performance Geral",
    ownerId: context.user.id,
    widgetIds: [
      "revenue",
      "spend",
      "roas_blended",
      "orders",
      "revenue_spend_line",
      "top_campaigns",
      "funnel",
    ],
  });

  const dashboard = await prisma.dashboard.create({
    data: {
      workspaceId: context.currentWorkspace.id,
      ownerId: context.user.id,
      name: draft.name,
      isDefault: true,
      layout: layoutToPrismaJson(draft.layout),
      widgets: widgetsToPrismaJson(draft.widgets),
    },
  });

  redirect(`/dashboards/${dashboard.id}`);
}
