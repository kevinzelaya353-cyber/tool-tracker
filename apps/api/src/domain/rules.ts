import {
  canReportDamage,
  resolveTransition,
  type LocationType,
  type ToolCondition,
  type ManualEventType,
  type ToolStatus,
} from "@tt/shared";

/**
 * Reglas de negocio puras (sin BD ni Express). Los services cargan y bloquean
 * los datos, llaman a estas funciones y solo escriben si no hay violaciones.
 */

export interface LockedTool {
  id: string;
  code: string;
  status: ToolStatus;
  currentLocationId: string | null;
  purchaseDate: Date;
  lastEventAt: Date | null;
}

export interface RuleViolation {
  toolId: string;
  code: string;
  message: string;
}

function chronology(tool: LockedTool, at: Date): RuleViolation | null {
  // purchaseDate es DATE (medianoche UTC): se permite cualquier hora de ese día.
  if (at.getTime() < tool.purchaseDate.getTime()) {
    return { toolId: tool.id, code: "BEFORE_PURCHASE", message: `${tool.code}: la fecha es anterior a la compra` };
  }
  if (tool.lastEventAt && at.getTime() < tool.lastEventAt.getTime()) {
    return {
      toolId: tool.id,
      code: "OUT_OF_ORDER",
      message: `${tool.code}: la fecha es anterior a su último movimiento registrado`,
    };
  }
  return null;
}

/** Con `dispatch` (traslado con chofer), además debe poder salir a tránsito. */
export function checkTransfer(
  tools: LockedTool[],
  req: { toolIds: string[]; fromLocationId: string; destinationType: LocationType; movedAt: Date; dispatch?: boolean },
): RuleViolation[] {
  const byId = new Map(tools.map((t) => [t.id, t]));
  const violations: RuleViolation[] = [];

  for (const toolId of req.toolIds) {
    const tool = byId.get(toolId);
    if (!tool) {
      violations.push({ toolId, code: "NOT_FOUND", message: "Herramienta no encontrada" });
      continue;
    }

    const t = resolveTransition(tool.status, "TRANSFER", req.destinationType);
    const out = req.dispatch ? resolveTransition(tool.status, "DISPATCH") : t;
    const bad = !t.ok ? t : !out.ok ? out : null;
    if (bad) {
      violations.push({ toolId, code: bad.code, message: `${tool.code}: ${bad.message}` });
      continue;
    }

    if (tool.currentLocationId !== req.fromLocationId) {
      violations.push({
        toolId,
        code: "NOT_AT_ORIGIN",
        message: `${tool.code}: no se encuentra en la ubicación de origen`,
      });
      continue;
    }

    const c = chronology(tool, req.movedAt);
    if (c) violations.push(c);
  }
  return violations;
}

/** Tipos de evento que admiten registrar un costo. */
export const COST_EVENTS: readonly ManualEventType[] = ["MAINTENANCE_START", "MAINTENANCE_END", "DAMAGE"];

export type LifecycleCheck = { ok: true; to: ToolStatus } | { ok: false; violation: RuleViolation };

export function checkLifecycleEvent(
  tool: LockedTool,
  req: { type: ManualEventType; occurredAt: Date; destinationType?: LocationType; hasCost: boolean },
): LifecycleCheck {
  if (req.hasCost && !COST_EVENTS.includes(req.type)) {
    return {
      ok: false,
      violation: { toolId: tool.id, code: "COST_NOT_ALLOWED", message: `${req.type} no admite costo` },
    };
  }

  const t = resolveTransition(tool.status, req.type, req.destinationType);
  if (!t.ok) return { ok: false, violation: { toolId: tool.id, code: t.code, message: `${tool.code}: ${t.message}` } };

  const c = chronology(tool, req.occurredAt);
  if (c) return { ok: false, violation: c };

  return { ok: true, to: t.to };
}

export type DamageCheck = { ok: true; marksDamaged: boolean } | { ok: false; violation: RuleViolation };

/**
 * Un reporte de daño siempre se registra como un registro nuevo, también si la herramienta ya está
 * dañada. Solo si "no funciona" y su estado lo permite, además la pasa a DANADA (evento DAMAGE),
 * y entonces debe respetar el orden cronológico del historial.
 */
export function checkDamageReport(tool: LockedTool, req: { occurredAt: Date; condition: ToolCondition }): DamageCheck {
  if (!canReportDamage(tool.status)) {
    return {
      ok: false,
      violation: { toolId: tool.id, code: "NOT_REPORTABLE", message: `${tool.code}: no se pueden reportar daños en estado ${tool.status}` },
    };
  }
  const marksDamaged = req.condition === "NO_OPERATIVA" && resolveTransition(tool.status, "DAMAGE").ok;
  // Sin cambio de estado no altera el orden del historial: basta con que sea posterior a la compra.
  const c = marksDamaged ? chronology(tool, req.occurredAt) : chronology({ ...tool, lastEventAt: null }, req.occurredAt);
  if (c) return { ok: false, violation: c };
  return { ok: true, marksDamaged };
}

/** Recepción (nuevo período) o devolución de una herramienta rentada. */
export function checkRentalEvent(
  tool: LockedTool,
  req: { type: "RENTAL_RECEIVE" | "RENTAL_RETURN"; occurredAt: Date; destinationType?: LocationType },
): LifecycleCheck {
  const t = resolveTransition(tool.status, req.type, req.destinationType);
  if (!t.ok) return { ok: false, violation: { toolId: tool.id, code: t.code, message: `${tool.code}: ${t.message}` } };
  const c = chronology(tool, req.occurredAt);
  if (c) return { ok: false, violation: c };
  return { ok: true, to: t.to };
}
