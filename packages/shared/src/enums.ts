// Mantener sincronizado con los enums de apps/api/prisma/schema.prisma.

export const TOOL_STATUS = [
  "BODEGA",
  "EN_PROYECTO",
  "EN_TRANSITO",
  "EN_MANTENIMIENTO",
  "DANADA",
  "EXTRAVIADA",
  "DADA_DE_BAJA",
  "DEVUELTA", // herramienta rentada que ya se devolvió al arrendador
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
  DEVUELTA: "Devuelta al arrendador",
};

/** Estados que cuentan como pérdida en el módulo financiero. */
export const LOSS_STATUSES: readonly ToolStatus[] = ["DANADA", "EXTRAVIADA", "DADA_DE_BAJA"];

export const LOCATION_TYPE = ["BODEGA", "PROYECTO"] as const;
export type LocationType = (typeof LOCATION_TYPE)[number];

/** ENTREGA/RECEPCION: traslados. RECEPCION/DEVOLUCION: alquileres (cómo llegó y cómo se devolvió). */
export const PHOTO_STAGE = ["ENTREGA", "RECEPCION", "DEVOLUCION"] as const;
export type PhotoStage = (typeof PHOTO_STAGE)[number];

/**
 * SUPERADMIN: rol global de la plataforma, sin organización. El resto pertenece siempre a una
 * organización; ADMIN es el administrador de su organización (UsuarioAdministrador).
 */
export const ROLE = ["SUPERADMIN", "ADMIN", "BODEGUERO", "SUPERVISOR", "CHOFER", "LECTOR"] as const;
export type Role = (typeof ROLE)[number];

/** Roles que se asignan dentro de una organización (un administrador nunca crea un SuperAdmin). */
export const TENANT_ROLE = ["ADMIN", "BODEGUERO", "SUPERVISOR", "CHOFER", "LECTOR"] as const satisfies readonly Role[];
export type TenantRole = (typeof TENANT_ROLE)[number];

/** Roles que inician sesión con contraseña completa (el resto usa PIN de 4 dígitos). */
export const PASSWORD_ROLES: readonly Role[] = ["SUPERADMIN", "ADMIN"];

/** Categorías con las que nace cada organización (las más comunes en obra). */
export const DEFAULT_CATEGORIES = [
  "Taladro",
  "Rotomartillo",
  "Pulidora",
  "Demoledor",
  "Sierra circular",
  "Extensión eléctrica",
  "Nivel láser",
  "Compresor",
  "Soldadora",
  "Atornillador",
  "Llave de impacto",
  "Sierra caladora",
  "Sierra ingleteadora",
  "Cortadora de concreto",
  "Cortadora de cerámica",
  "Lijadora",
  "Pistola de calor",
  "Mezcladora de concreto",
  "Vibrador de concreto",
  "Bailarina (apisonador)",
  "Placa compactadora",
  "Generador eléctrico",
  "Bomba de agua",
  "Hidrolavadora",
  "Nivel óptico",
  "Estación total",
  "Andamio",
  "Escalera",
  "Carretilla",
  "Herramienta manual",
  "Otro",
] as const;

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
  "RENTAL_RECEIVE", // llega una herramienta rentada (inicio de un período de alquiler)
  "RENTAL_RETURN", // se devuelve al arrendador (fin del período)
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

/** Herramienta de la empresa o rentada a un tercero. */
export const TOOL_OWNERSHIP = ["PROPIA", "RENTADA"] as const;
export type ToolOwnership = (typeof TOOL_OWNERSHIP)[number];

export const TOOL_OWNERSHIP_LABEL: Record<ToolOwnership, string> = {
  PROPIA: "Propia",
  RENTADA: "Rentada",
};

/** Qué le pasó a la herramienta (reportes de daño e incidencias de alquiler). */
export const DAMAGE_KIND = ["GOLPE", "FALLA", "PIEZA_FALTANTE", "ROTURA", "DESGASTE", "OTRO"] as const;
export type DamageKind = (typeof DAMAGE_KIND)[number];

export const DAMAGE_KIND_LABEL: Record<DamageKind, string> = {
  GOLPE: "Golpe",
  FALLA: "Falla",
  PIEZA_FALTANTE: "Pieza faltante",
  ROTURA: "Rotura",
  DESGASTE: "Desgaste",
  OTRO: "Otro / observación",
};

/** Estado físico observado (al reportar un daño, al recibir o al devolver una herramienta rentada). */
export const TOOL_CONDITION = ["BUENO", "CON_DETALLES", "NO_OPERATIVA"] as const;
export type ToolCondition = (typeof TOOL_CONDITION)[number];

export const TOOL_CONDITION_LABEL: Record<ToolCondition, string> = {
  BUENO: "Buen estado",
  CON_DETALLES: "Funciona, con detalles",
  NO_OPERATIVA: "No funciona",
};

export const RENTAL_STATUS = ["ACTIVO", "DEVUELTO"] as const;
export type RentalStatus = (typeof RENTAL_STATUS)[number];

export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  ACTIVO: "En alquiler",
  DEVUELTO: "Devuelto",
};

/** Límites de fotos (la API y la app usan los mismos). */
export const DAMAGE_MAX_PHOTOS = 3;
export const RENTAL_MAX_PHOTOS = 10;
