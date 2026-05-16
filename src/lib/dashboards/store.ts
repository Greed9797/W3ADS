import type { Prisma } from "@prisma/client";

import {
  createDashboardLayout,
  defaultDashboardWidgets,
  resolveWidgetCatalogItem,
  type DashboardLayoutItem,
  type DashboardWidgetConfig,
  type DashboardWidgetId,
} from "@/lib/metrics/kpi-catalog";

export type DashboardDraft = {
  name: string;
  ownerId: string;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidgetConfig[];
};

export const demoDashboardId = "demo-performance-geral";

export function sanitizeDashboardName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length > 0 ? name.slice(0, 80) : "Novo dashboard";
}

export function normalizeWidgetIds(values: string[]) {
  const ids = values.filter((value): value is DashboardWidgetId =>
    Boolean(resolveWidgetCatalogItem(value)),
  );

  return ids.length > 0 ? ids : defaultDashboardWidgets().map((widget) => widget.widgetId);
}

export function buildDashboardDraft(input: {
  name: string;
  ownerId: string;
  widgetIds: string[];
}): DashboardDraft {
  const widgets = defaultDashboardWidgets(normalizeWidgetIds(input.widgetIds));

  return {
    name: sanitizeDashboardName(input.name),
    ownerId: input.ownerId,
    widgets,
    layout: createDashboardLayout(widgets),
  };
}

export function serializeDashboardWidgets(widgets: DashboardWidgetConfig[]) {
  return JSON.stringify(widgets);
}

export function serializeDashboardLayout(layout: DashboardLayoutItem[]) {
  return JSON.stringify(layout);
}

function isWidgetConfig(value: unknown): value is DashboardWidgetConfig {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as DashboardWidgetConfig;
  return (
    typeof candidate.instanceId === "string" &&
    typeof candidate.widgetId === "string" &&
    Boolean(resolveWidgetCatalogItem(candidate.widgetId))
  );
}

export function parseDashboardWidgets(value: unknown): DashboardWidgetConfig[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.every(isWidgetConfig)) {
      return parsed;
    }
  } catch {
    return defaultDashboardWidgets();
  }

  return defaultDashboardWidgets();
}

export function parseDashboardLayout(value: unknown, widgets: DashboardWidgetConfig[]) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as DashboardLayoutItem).instanceId === "string" &&
          typeof (item as DashboardLayoutItem).order === "number",
      )
    ) {
      return parsed as DashboardLayoutItem[];
    }
  } catch {
    return createDashboardLayout(widgets);
  }

  return createDashboardLayout(widgets);
}

export function widgetsToPrismaJson(widgets: DashboardWidgetConfig[]): Prisma.InputJsonValue {
  return JSON.parse(serializeDashboardWidgets(widgets)) as Prisma.InputJsonValue;
}

export function layoutToPrismaJson(layout: DashboardLayoutItem[]): Prisma.InputJsonValue {
  return JSON.parse(serializeDashboardLayout(layout)) as Prisma.InputJsonValue;
}

export function buildDemoDashboard() {
  const widgets = defaultDashboardWidgets();

  return {
    id: demoDashboardId,
    workspaceId: "demo-workspace",
    ownerId: "demo-user",
    name: "Performance Geral",
    isDefault: true,
    layout: createDashboardLayout(widgets),
    widgets,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}
