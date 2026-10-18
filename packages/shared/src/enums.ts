// Mantener sincronizado con los enums de apps/api/prisma/schema.prisma.

export const TOOL_STATUS = [
  "BODEGA",
  "EN_PROYECTO",
  "EN_TRANSITO",
  "EN_MANTENIMIENTO",
  "DANADA",
  "EXTRAVIADA",
  "DADA_DE_BAJA",
] as const;
export type ToolStatus = (typeof TOOL_STATUS)[number];

export const TOOL_STATUS_LABEL: Record<ToolStatus, string> = {
  BODEGA: "Bodega (disponible)",
  EN_PROYECTO: "En proyecto",
  EN_TRANSITO: "En tránsito",
  EN_MANTENIMIENTO: "En mantenimiento",
  DANADA: "Dañada",
  EXTRAVIADA: "Extraviada",
  DADA_DE_BAJA: "Dada de baja",
};

/** Estados que cuentan como pérdida en el módulo financiero. */
export const LOSS_STATUSES: readonly ToolStatus[] = ["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"];

export const LOCATION_TYPE = ["BODEGA", "PROYECTO"] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

export const PHOTO_STAGE = ["ENTREGA", "RECEPCION"] as const;
export type PhotoStage = (typeof PHOTO_STAGE)[number];

export const ROLE = ["ADMIN", "BODEGUERO", "SUPERVISOR", "CHOFER", "LECTOR"] as const;
export type Role = (typeof ROLE)[number];

export const EVENT_TYPE = [
  "PURCHASE",
  "DISPATCH", // salida de un traslado con chofer: queda en tránsito
  "TRANSFER", // llegada al destino (directa o al confirmar la recepción)
  "MAINTENANCE_START",
  "MAINTENANCE_END",
  "DAMAGE",
  "LOSS",
  "RECOVERY",
  "DECOMMISSION",
] as const;
export type EventType = (typeof EVENT_TYPE)[number];

/** Traslado directo (llega al registrarlo) o con chofer (en tránsito hasta confirmar la recepción). */
export const TRANSFER_STATUS = ["EN_TRANSITO", "RECIBIDO"] as const;
export type TransferStatus = (typeof TRANSFER_STATUS)[number];

/** Resultado de cada herramienta al confirmar la recepción. */
export const ITEM_OUTCOME = ["RECIBIDA", "DANADA", "NO_LLEGO"] as const;
export type ItemOutcome = (typeof ITEM_OUTCOME)[number];

export const ITEM_OUTCOME_LABEL: Record<ItemOutcome, string> = {
  RECIBIDA: "Llegó bien",
  DANADA: "Llegó dañada",
  NO_LLEGO: "No llegó",
};

/** Cómo se confirmó una recepción: sesión de quien recibe, su PIN en otro teléfono o un supervisor en su nombre. */
export const RECEPTION_METHOD = ["SESION", "PIN", "SUPERVISION"] as const;
export type ReceptionMethod = (typeof RECEPTION_METHOD)[number];

/** Eventos que un usuario registra manualmente (DISPATCH/TRANSFER van por /transfers, PURCHASE al dar de alta). */
export const MANUAL_EVENT_TYPE = [
  "MAINTENANCE_START",
  "MAINTENANCE_END",
  "DAMAGE",
  "LOSS",
  "RECOVERY",
  "DECOMMISSION",
] as const satisfies readonly EventType[];
export type ManualEventType = (typeof MANUAL_EVENT_TYPE)[number];
