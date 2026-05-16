export type DashboardPeriodPreset = "today" | "7d" | "30d" | "month" | "custom";

export type DashboardPeriod = {
  preset: DashboardPeriodPreset;
  from: Date;
  to: Date;
  previousFrom: Date;
  previousTo: Date;
  days: number;
  label: string;
};

type PeriodParams = Record<string, string | string[] | undefined>;

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDaysInclusive(from: Date, to: Date) {
  const diff = to.getTime() - from.getTime();
  return Math.max(Math.floor(diff / 86_400_000) + 1, 1);
}

function parseDateKey(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildPeriod(preset: DashboardPeriodPreset, from: Date, to: Date): DashboardPeriod {
  const normalizedFrom = startOfUtcDay(from);
  const normalizedTo = startOfUtcDay(to);
  const days = diffDaysInclusive(normalizedFrom, normalizedTo);
  const previousTo = addDays(normalizedFrom, -1);
  const previousFrom = addDays(previousTo, -(days - 1));

  return {
    preset,
    from: normalizedFrom,
    to: normalizedTo,
    previousFrom,
    previousTo,
    days,
    label: `${dateFormatter.format(normalizedFrom)} - ${dateFormatter.format(normalizedTo)}`,
  };
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function listDateKeys(from: Date, to: Date) {
  const keys: string[] = [];
  let cursor = startOfUtcDay(from);
  const end = startOfUtcDay(to);

  while (cursor <= end) {
    keys.push(toDateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

export function getDashboardPeriod(
  params: PeriodParams = {},
  now = new Date(),
): DashboardPeriod {
  const today = startOfUtcDay(now);
  const preset = firstParam(params.period) as DashboardPeriodPreset | undefined;

  if (preset === "today") {
    return buildPeriod("today", today, today);
  }

  if (preset === "7d") {
    return buildPeriod("7d", addDays(today, -6), today);
  }

  if (preset === "month") {
    return buildPeriod("month", new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today);
  }

  if (preset === "custom") {
    const from = parseDateKey(firstParam(params.from));
    const to = parseDateKey(firstParam(params.to));

    if (from && to && from <= to) {
      return buildPeriod("custom", from, to);
    }
  }

  return buildPeriod("30d", addDays(today, -29), today);
}
