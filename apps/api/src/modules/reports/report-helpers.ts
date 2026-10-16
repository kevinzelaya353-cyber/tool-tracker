import { TOOL_STATUS, type ToolStatus } from "@tt/shared";

export const LOSS_STATUS_LIST = ["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"] as const;

/** Tipos de evento cuyo `cost` cuenta como gasto de mantenimiento/reparación. */
export const MAINTENANCE_COST_EVENTS = ["MAINTENANCE_START", "MAINTENANCE_END", "DAMAGE"] as const;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Completa con ceros los estados sin herramientas para que el cliente reciba siempre todas las claves. */
export function fillByStatus(
  rows: { status: ToolStatus; count: number; value: string }[],
): Record<ToolStatus, { count: number; value: string }> {
  const out = Object.fromEntries(TOOL_STATUS.map((s) => [s, { count: 0, value: "0.00" }])) as Record<
    ToolStatus,
    { count: number; value: string }
  >;
  for (const r of rows) out[r.status] = { count: r.count, value: r.value };
  return out;
}

/** Rango por defecto de la serie: los últimos 12 meses completos incluyendo el actual. */
export function defaultSeriesRange(now = new Date()): { from: Date; to: Date } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from, to: now };
}
