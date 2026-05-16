import { cookies } from "next/headers";

import {
  buildDashboardDraft,
  buildDemoDashboard,
  demoDashboardId,
  parseDashboardWidgets,
  serializeDashboardWidgets,
} from "@/lib/dashboards/store";
import {
  addWidget,
  createDashboardLayout,
  moveWidget,
  removeWidget,
  type DashboardWidgetId,
} from "@/lib/metrics/kpi-catalog";

export const demoDashboardsCookie = "adstart_demo_dashboards";

type DemoDashboardStored = {
  id: string;
  name: string;
  widgets: string;
  isDefault: boolean;
  updatedAt: string;
};

function parseStoredDashboards(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as DemoDashboardStored).id === "string" &&
          typeof (item as DemoDashboardStored).name === "string" &&
          typeof (item as DemoDashboardStored).widgets === "string",
      )
    ) {
      return parsed as DemoDashboardStored[];
    }
  } catch {
    return [];
  }

  return [];
}

function materializeDemoDashboard(item: DemoDashboardStored) {
  const widgets = parseDashboardWidgets(item.widgets);

  return {
    id: item.id,
    workspaceId: "demo-workspace",
    ownerId: "demo-user",
    name: item.name,
    isDefault: item.isDefault,
    layout: createDashboardLayout(widgets),
    widgets,
    createdAt: new Date(item.updatedAt),
    updatedAt: new Date(item.updatedAt),
  };
}

export async function getDemoDashboards() {
  const cookieStore = await cookies();
  const stored = parseStoredDashboards(cookieStore.get(demoDashboardsCookie)?.value);
  const storedHasDefault = stored.some((dashboard) => dashboard.isDefault);
  const defaultDashboard = {
    ...buildDemoDashboard(),
    isDefault: !storedHasDefault,
  };

  return [defaultDashboard, ...stored.map(materializeDemoDashboard)];
}

export async function getDemoDashboard(id: string) {
  const dashboards = await getDemoDashboards();
  return dashboards.find((dashboard) => dashboard.id === id) ?? null;
}

async function writeStoredDashboards(items: DemoDashboardStored[]) {
  const cookieStore = await cookies();
  cookieStore.set(demoDashboardsCookie, JSON.stringify(items.slice(0, 6)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function createDemoDashboard(input: {
  name: string;
  ownerId: string;
  widgetIds: string[];
}) {
  const cookieStore = await cookies();
  const stored = parseStoredDashboards(cookieStore.get(demoDashboardsCookie)?.value);
  const draft = buildDashboardDraft(input);
  const now = new Date().toISOString();
  const id = `demo-${Date.now().toString(36)}`;

  await writeStoredDashboards([
    {
      id,
      name: draft.name,
      widgets: serializeDashboardWidgets(draft.widgets),
      isDefault: false,
      updatedAt: now,
    },
    ...stored,
  ]);

  return id;
}

export async function updateDemoDashboardWidgets(input: {
  id: string;
  action: "add" | "remove" | "move";
  widgetId?: DashboardWidgetId;
  instanceId?: string;
  direction?: "up" | "down";
}) {
  if (input.id === demoDashboardId) {
    return;
  }

  const cookieStore = await cookies();
  const stored = parseStoredDashboards(cookieStore.get(demoDashboardsCookie)?.value);
  const next = stored.map((dashboard) => {
    if (dashboard.id !== input.id) {
      return dashboard;
    }

    let widgets = parseDashboardWidgets(dashboard.widgets);

    if (input.action === "add" && input.widgetId) {
      widgets = addWidget(widgets, input.widgetId);
    }

    if (input.action === "remove" && input.instanceId) {
      widgets = removeWidget(widgets, input.instanceId);
    }

    if (input.action === "move" && input.instanceId && input.direction) {
      widgets = moveWidget(widgets, input.instanceId, input.direction);
    }

    return {
      ...dashboard,
      widgets: serializeDashboardWidgets(widgets),
      updatedAt: new Date().toISOString(),
    };
  });

  await writeStoredDashboards(next);
}

export async function setDemoDefaultDashboard(id: string) {
  const cookieStore = await cookies();
  const stored = parseStoredDashboards(cookieStore.get(demoDashboardsCookie)?.value);

  await writeStoredDashboards(
    stored.map((dashboard) => ({
      ...dashboard,
      isDefault: dashboard.id === id,
      updatedAt: new Date().toISOString(),
    })),
  );
}
