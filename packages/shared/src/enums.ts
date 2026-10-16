// Mantener sincronizado con los enums de apps/api/prisma/schema.prisma.

export const TOOL_STATUS = [
  "BODEGA",
  "EN_PROYECTO",
  "EN_MANTENIMIENTO",
  "DANADA",
  "EXTRAVIADA",
  "DADA_DE_BAJA",
] as const;
export type ToolStatus = (typeof TOOL_STATUS)[number];

export const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  BODEGA: "Bodega (disponible)",
  EN_PROYECTO: "En proyecto",
  EN_MANTENIMIENTO: "En mantenimiento",
  DANADA: "Dañada",
  EXTRAVIADA: "Extraviada",
  DADA_DE_BAJA: "Dada de baja",
};

/** Estados que cuentan como pérdida en el módulo financiero. */
export const LOSS_STATUSES: readonly ToolStatus[] = ["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"];

export const LOCATION_TYPE = ["BODEGA", "PROYECTO"] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

export const ROLE = ["ADMIN", "BODEGUERO", "SUPERVISOR", "LECTOR"] as const;
export type Role = (typeof ROLE)[number];

export const EVENT_TYPE = [
  "PURCHASE",
  "TRANSFER",
  "MAINTENANCE_START",
  "MAINTENANCE_END",
  "DAMAGE",
  "LOSS",
  "RECOVERY",
  "DECOMMISSION",
] as const;
export type EventType = (typeof EVENT_TYPE)[number];

/** Eventos que un usuario registra manualmente (TRANSFER va por /transfers, PURCHASE al dar de alta). */
export const MANUAL_EVENT_TYPE = [
  "MAINTENANCE_START",
  "MAINTENANCE_END",
  "DAMAGE",
  "LOSS",
  "RECOVERY",
  "DECOMMISSION",
] as const satisfies readonly EventType[];
export type ManualEventType = (typeof MANUAL_EVENT_TYPE)[number];
