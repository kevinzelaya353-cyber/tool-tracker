import { useQuery } from "@tanstack/react-query";
import type { CategorySpendRow, LossReport, ReportSummary, SpendPeriodRow } from "@tt/shared";
import { api } from "@/lib/api";
import type { Column } from "@/components/charts/StackedBarChart";

export type Granularity = "month" | "year";

export interface Range {
  from?: string;
  to?: string;
}

export const reportKeys = {
  all: ["reports"] as const,
  summary: ["reports", "summary"] as const,
  overTime: (r: Range, g: Granularity) => ["reports", "over-time", r, g] as const,
  byCategory: (r: Range) => ["reports", "by-category", r] as const,
  losses: (r: Range) => ["reports", "losses", r] as const,
};

export const useReportSummary = (enabled = true) =>
  useQuery({ queryKey: reportKeys.summary, enabled, queryFn: () => api.get<ReportSummary>("/api/reports/summary") });

export const useSpendOverTime = (range: Range, granularity: Granularity, enabled = true) =>
  useQuery({
    queryKey: reportKeys.overTime(range, granularity),
    enabled,
    queryFn: () => api.get<SpendPeriodRow[]>("/api/reports/spend-over-time", { ...range, granularity }),
  });

export const useSpendByCategory = (range: Range) =>
  useQuery({
    queryKey: reportKeys.byCategory(range),
    queryFn: () => api.get<CategorySpendRow[]>("/api/reports/spend-by-category", { ...range }),
  });

export const useLosses = (range: Range) =>
  useQuery({ queryKey: reportKeys.losses(range), queryFn: () => api.get<LossReport>("/api/reports/losses", { ...range }) });

// ---------- Presets de periodo ----------

export type Preset = "12m" | "ytd" | "5y";

export const PRESET_LABEL: Record<Preset, string> = {
  "12m": "Últimos 12 meses",
  ytd: "Año en curso",
  "5y": "Últimos 5 años",
};

export function presetRange(p: Preset, now = new Date()): { range: Range; granularity: Granularity } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const to = now.toISOString();
  if (p === "ytd") return { range: { from: new Date(y, 0, 1).toISOString(), to }, granularity: "month" };
  if (p === "5y") return { range: { from: new Date(y - 4, 0, 1).toISOString(), to }, granularity: "year" };
  return { range: { from: new Date(y, m - 11, 1).toISOString(), to }, granularity: "month" };
}

// ---------- Adaptadores para las gráficas ----------

const monthShort = new Intl.DateTimeFormat("es", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("es", { month: "long", year: "numeric", timeZone: "UTC" });

function labels(period: string, g: Granularity) {
  const d = new Date(`${period}T00:00:00Z`);
  if (g === "year") return { label: String(d.getUTCFullYear()), fullLabel: String(d.getUTCFullYear()) };
  return { label: monthShort.format(d).replace(".", ""), fullLabel: monthLong.format(d) };
}

/** Compras + mantenimiento apilados (son gasto; las pérdidas van en su propio gráfico). */
export const toSpendColumns = (rows: SpendPeriodRow[], g: Granularity): Column[] =>
  rows.map((r) => ({ ...labels(r.period, g), values: [Number(r.purchases), Number(r.maintenance)] }));

export const toLossColumns = (rows: SpendPeriodRow[], g: Granularity): Column[] =>
  rows.map((r) => ({ ...labels(r.period, g), values: [Number(r.losses)] }));
