import type { EventType, LocationType, ToolStatus } from "./enums.js";

/**
 * Máquina de estados de una herramienta. Es la única fuente de verdad sobre qué
 * transiciones son válidas; la usan tanto la API (para rechazar) como la app
 * (para mostrar solo las acciones posibles).
 */

type Transition =
  | { from: readonly ToolStatus[]; to: ToolStatus }
  | { from: readonly ToolStatus[]; to: (dest: LocationType) => ToolStatus };

const TRANSITIONS: Record<Exclude<EventType, "PURCHASE">, Transition> = {
  // Directo desde el origen, o al confirmar la recepción de un traslado con chofer.
  TRANSFER: {
    from: ["BODEGA", "EN_PROYECTO", "EN_TRANSITO"],
    to: (dest) => (dest === "BODEGA" ? "BODEGA" : "EN_PROYECTO"),
  },
  // Sale con un chofer: no está en ningún lugar hasta que alguien confirma que llegó.
  DISPATCH: { from: ["BODEGA", "EN_PROYECTO"], to: "EN_TRANSITO" },
  MAINTENANCE_START: { from: ["BODEGA", "EN_PROYECTO", "DANADA"], to: "EN_MANTENIMIENTO" },
  // Al salir de mantenimiento siempre regresa a bodega; nunca directo a un proyecto.
  MAINTENANCE_END: { from: ["EN_MANTENIMIENTO"], to: "BODEGA" },
  DAMAGE: { from: ["BODEGA", "EN_PROYECTO", "EN_MANTENIMIENTO"], to: "DANADA" },
  LOSS: { from: ["BODEGA", "EN_PROYECTO"], to: "EXTRAVIADA" },
  RECOVERY: { from: ["EXTRAVIADA"], to: "BODEGA" },
  DECOMMISSION: { from: ["DANADA", "EXTRAVIADA"], to: "DADA_DE_BAJA" },
  // Herramientas rentadas: un nuevo período de alquiler la trae a una bodega o directo a un proyecto.
  RENTAL_RECEIVE: { from: ["DEVUELTA"], to: (dest) => (dest === "BODEGA" ? "BODEGA" : "EN_PROYECTO") },
  // Se devuelve al arrendador desde donde esté, también dañada (la diferencia queda documentada).
  RENTAL_RETURN: { from: ["BODEGA", "EN_PROYECTO", "DANADA"], to: "DEVUELTA" },
};

/** Eventos que obligan a indicar una ubicación destino y de qué tipo debe ser. */
export const EVENT_REQUIRES_LOCATION: Partial<Record<EventType, LocationType | "ANY">> = {
  TRANSFER: "ANY",
  MAINTENANCE_END: "BODEGA",
  RECOVERY: "BODEGA",
  RENTAL_RECEIVE: "ANY",
};

export type TransitionResult =
  | { ok: true; to: ToolStatus }
  | { ok: false; code: "INVALID_TRANSITION" | "DESTINATION_REQUIRED" | "INVALID_DESTINATION"; message: string };

export function resolveTransition(
  current: ToolStatus,
  event: Exclude<EventType, "PURCHASE">,
  destinationType?: LocationType,
): TransitionResult {
  const t = TRANSITIONS[event];
  if (!t.from.includes(current)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `No se puede aplicar ${event} a una herramienta en estado ${current}`,
    };
  }

  const required = EVENT_REQUIRES_LOCATION[event];
  if (required) {
    if (!destinationType) {
      return { ok: false, code: "DESTINATION_REQUIRED", message: `${event} requiere ubicación destino` };
    }
    if (required !== "ANY" && required !== destinationType) {
      return {
        ok: false,
        code: "INVALID_DESTINATION",
        message: `${event} requiere un destino de tipo ${required}`,
      };
    }
  }

  const to = typeof t.to === "function" ? t.to(destinationType as LocationType) : t.to;
  return { ok: true, to };
}

/** Acciones disponibles para un estado (útil para la UI). */
export function availableEvents(current: ToolStatus): Exclude<EventType, "PURCHASE">[] {
  return (Object.keys(TRANSITIONS) as Exclude<EventType, "PURCHASE">[]).filter((e) =>
    TRANSITIONS[e].from.includes(current),
  );
}

export function isTerminal(status: ToolStatus): boolean {
  return availableEvents(status).length === 0;
}

/** Estados en los que la herramienta está físicamente con la empresa y se le puede reportar un daño. */
const DAMAGE_REPORTABLE: readonly ToolStatus[] = ["BODEGA", "EN_PROYECTO", "EN_TRANSITO", "EN_MANTENIMIENTO", "DANADA"];

export function canReportDamage(status: ToolStatus): boolean {
  return DAMAGE_REPORTABLE.includes(status);
}
