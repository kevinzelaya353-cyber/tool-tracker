import { describe, expect, it } from "vitest";
import { checkDamageReport, checkLifecycleEvent, checkRentalEvent, checkTransfer, type LockedTool } from "./rules.js";

const BODEGA = "loc-bodega";
const OBRA = "loc-obra";

const tool = (over: Partial<LockedTool> = {}): LockedTool => ({
  id: "t1",
  code: "TAL-001",
  status: "BODEGA",
  currentLocationId: BODEGA,
  purchaseDate: new Date("2026-01-10T00:00:00Z"),
  lastEventAt: new Date("2026-01-10T12:00:00Z"),
  ...over,
});

const transfer = (over: Partial<Parameters<typeof checkTransfer>[1]> = {}) => ({
  toolIds: ["t1"],
  fromLocationId: BODEGA,
  destinationType: "PROYECTO" as const,
  movedAt: new Date("2026-02-01T08:00:00Z"),
  ...over,
});

describe("checkTransfer", () => {
  it("traslado válido sin violaciones", () => {
    expect(checkTransfer([tool()], transfer())).toEqual([]);
  });

  it("herramienta inexistente", () => {
    expect(checkTransfer([], transfer())[0]?.code).toBe("NOT_FOUND");
  });

  it("no se puede enviar a proyecto una herramienta extraviada", () => {
    expect(checkTransfer([tool({ status: "EXTRAVIADA" })], transfer())[0]?.code).toBe("INVALID_TRANSITION");
  });

  it("la herramienta debe estar en el origen declarado", () => {
    expect(checkTransfer([tool({ currentLocationId: OBRA })], transfer())[0]?.code).toBe("NOT_AT_ORIGIN");
  });

  it("no se aceptan movimientos anteriores al último registrado", () => {
    const v = checkTransfer([tool()], transfer({ movedAt: new Date("2026-01-10T11:00:00Z") }));
    expect(v[0]?.code).toBe("OUT_OF_ORDER");
  });

  it("no se aceptan movimientos anteriores a la compra", () => {
    const v = checkTransfer([tool({ lastEventAt: null })], transfer({ movedAt: new Date("2026-01-09T23:00:00Z") }));
    expect(v[0]?.code).toBe("BEFORE_PURCHASE");
  });

  it("reporta todas las herramientas inválidas, no solo la primera", () => {
    const v = checkTransfer(
      [tool({ id: "a", status: "DANADA" }), tool({ id: "b", currentLocationId: OBRA }), tool({ id: "c" })],
      transfer({ toolIds: ["a", "b", "c"] }),
    );
    expect(v.map((x) => x.toolId)).toEqual(["a", "b"]);
  });

  it("con chofer: válido desde bodega; una herramienta ya en tránsito no puede volver a salir", () => {
    expect(checkTransfer([tool()], transfer({ dispatch: true }))).toEqual([]);
    // En tránsito no tiene ubicación: ni directo ni con chofer puede salir de un origen.
    const v = checkTransfer([tool({ status: "EN_TRANSITO", currentLocationId: null })], transfer({ dispatch: true }));
    expect(v[0]?.code).toBe("INVALID_TRANSITION");
    const direct = checkTransfer([tool({ status: "EN_TRANSITO", currentLocationId: null })], transfer());
    expect(direct[0]?.code).toBe("NOT_AT_ORIGIN");
  });
});

describe("checkLifecycleEvent", () => {
  const at = new Date("2026-03-01T00:00:00Z");

  it("reportar daño en proyecto → DANADA", () => {
    expect(
      checkLifecycleEvent(tool({ status: "EN_PROYECTO" }), { type: "DAMAGE", occurredAt: at, hasCost: false }),
    ).toEqual({ ok: true, to: "DANADA" });
  });

  it("fin de mantenimiento exige destino bodega", () => {
    const r = checkLifecycleEvent(tool({ status: "EN_MANTENIMIENTO" }), {
      type: "MAINTENANCE_END",
      occurredAt: at,
      destinationType: "PROYECTO",
      hasCost: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("INVALID_DESTINATION");
  });

  it("LOSS no admite costo", () => {
    const r = checkLifecycleEvent(tool(), { type: "LOSS", occurredAt: at, hasCost: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("COST_NOT_ALLOWED");
  });

  it("aplica la regla cronológica", () => {
    const r = checkLifecycleEvent(tool(), {
      type: "DAMAGE",
      occurredAt: new Date("2026-01-05T00:00:00Z"),
      hasCost: false,
    });
    expect(r.ok).toBe(false);
  });
});

describe("checkDamageReport", () => {
  const at = new Date("2026-03-01T00:00:00Z");

  it("una herramienta ya dañada admite reportes nuevos sin cambiar de estado", () => {
    expect(checkDamageReport(tool({ status: "DANADA" }), { occurredAt: at, condition: "NO_OPERATIVA" })).toEqual({
      ok: true,
      marksDamaged: false,
    });
  });

  it("si no funciona, la pasa a DANADA", () => {
    expect(checkDamageReport(tool({ status: "EN_PROYECTO" }), { occurredAt: at, condition: "NO_OPERATIVA" })).toEqual({
      ok: true,
      marksDamaged: true,
    });
  });

  it("un detalle menor no cambia el estado ni exige orden cronológico", () => {
    const late = tool({ lastEventAt: new Date("2026-04-01T00:00:00Z") });
    expect(checkDamageReport(late, { occurredAt: at, condition: "CON_DETALLES" })).toEqual({ ok: true, marksDamaged: false });
  });

  it("si cambia el estado, no puede ser anterior al último movimiento", () => {
    const late = tool({ lastEventAt: new Date("2026-04-01T00:00:00Z") });
    const r = checkDamageReport(late, { occurredAt: at, condition: "NO_OPERATIVA" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("OUT_OF_ORDER");
  });

  it("nunca antes de la compra", () => {
    const r = checkDamageReport(tool(), { occurredAt: new Date("2025-12-31T00:00:00Z"), condition: "BUENO" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("BEFORE_PURCHASE");
  });

  it.each(["EXTRAVIADA", "DADA_DE_BAJA", "DEVUELTA"] as const)("rechaza reportes de una herramienta %s", (status) => {
    const r = checkDamageReport(tool({ status }), { occurredAt: at, condition: "BUENO" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violation.code).toBe("NOT_REPORTABLE");
  });
});

describe("checkRentalEvent", () => {
  const at = new Date("2026-03-01T00:00:00Z");

  it("devolver la deja DEVUELTA y volver a recibirla la coloca según el destino", () => {
    expect(checkRentalEvent(tool({ status: "EN_PROYECTO" }), { type: "RENTAL_RETURN", occurredAt: at })).toEqual({ ok: true, to: "DEVUELTA" });
    expect(
      checkRentalEvent(tool({ status: "DEVUELTA", currentLocationId: null }), { type: "RENTAL_RECEIVE", occurredAt: at, destinationType: "PROYECTO" }),
    ).toEqual({ ok: true, to: "EN_PROYECTO" });
  });

  it("no se devuelve en tránsito", () => {
    const r = checkRentalEvent(tool({ status: "EN_TRANSITO" }), { type: "RENTAL_RETURN", occurredAt: at });
    expect(r.ok).toBe(false);
  });
});
