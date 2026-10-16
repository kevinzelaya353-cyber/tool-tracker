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
  TRANSFER: {
    from: ["BODEGA", "EN_PROYECTO"],
    to: (dest) => (dest === "BODEGA" ? "BODEGA" : "EN_PROYECTO"),
  },
  MAINTENANCE_START: { from: ["BODEGA", "EN_PROYECTO", "DANADA"], to: "EN_MANTENIMIENTO" },
  // Al salir de mantenimiento siempre regresa a bodega; nunca directo a un proyecto.
  MAINTENANCE_END: { from: ["EN_MANTENIMIENTO"], to: "BODEGA" },
  DAMAGE: { from: ["BODEGA", "EN_PROYECTO", "EN_MANTENIMIENTO"], to: "DANADA" },
  LOSS: { from: ["BODEGA", "EN_PROYECTO"], to: "EXTRAVIADA" },
  RECOVERY: { from: ["EXTRAVIADA"], to: "BODEGA" },
  DECOMMISSION: { from: ["DANADA", "EXTRAVIADA"], to: "DADA_DE_BAJA" },
};

/** Eventos que obligan a indicar una ubicación destino y de qué tipo debe ser. */
export const EVENT_REQUIRES_LOCATION: Partial<Record<EventType, LocationType | "ANY">> = {
  TRANSFER: "ANY",
  MAINTENANCE_END: "BODEGA",
  RECOVERY: "BODEGA",
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
