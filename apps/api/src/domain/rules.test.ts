import { describe, expect, it } from "vitest";
import { checkLifecycleEvent, checkTransfer, type LockedTool } from "./rules.js";

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
