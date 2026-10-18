import type { EventType, Role } from "@tt/shared";

// Lempiras por defecto; "es-HN" da el formato local: L 1,234.50.
const currency = process.env.EXPO_PUBLIC_CURRENCY ?? "HNL";
const moneyFmt = new Intl.NumberFormat("es-HN", { style: "currency", currency });
const dateFmt = new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export const formatMoney = (v: string | number | null | undefined) => (v == null ? "—" : moneyFmt.format(Number(v)));

/** Fechas DATE (compra) llegan como medianoche UTC: se formatean en UTC para no correr un día. */
export const formatDate = (iso: string) => dateFmt.format(new Date(iso));
export const formatDateUTC = (iso: string) =>
  new Intl.DateTimeFormat("es", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
export const formatDateTime = (iso: string | Date) => dateTimeFmt.format(typeof iso === "string" ? new Date(iso) : iso);

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  BODEGUERO: "Bodeguero",
  SUPERVISOR: "Supervisor de proyecto",
  CHOFER: "Chofer",
  LECTOR: "Solo lectura",
};

export const EVENT_LABEL: Record<EventType, string> = {
  PURCHASE: "Compra",
  DISPATCH: "Salida con chofer",
  TRANSFER: "Traslado",
  MAINTENANCE_START: "Enviada a mantenimiento",
  MAINTENANCE_END: "Mantenimiento finalizado",
  DAMAGE: "Reporte de daño",
  LOSS: "Reporte de extravío",
  RECOVERY: "Recuperada",
  DECOMMISSION: "Dada de baja",
};

/** Texto del botón de acción en el detalle de la herramienta. */
export const EVENT_ACTION: Partial<Record<EventType, string>> = {
  MAINTENANCE_START: "Enviar a mantenimiento",
  MAINTENANCE_END: "Finalizar mantenimiento",
  DAMAGE: "Reportar daño",
  LOSS: "Reportar extravío",
  RECOVERY: "Marcar recuperada",
  DECOMMISSION: "Dar de baja",
};
