import { describe, expect, it } from "vitest";
import { availableEvents, isTerminal, resolveTransition } from "./state-machine.js";

describe("resolveTransition", () => {
  it("bodega → proyecto deja la herramienta EN_PROYECTO", () => {
    expect(resolveTransition("BODEGA", "TRANSFER", "PROYECTO")).toEqual({ ok: true, to: "EN_PROYECTO" });
  });

  it("proyecto → proyecto se mantiene EN_PROYECTO", () => {
    expect(resolveTransition("EN_PROYECTO", "TRANSFER", "PROYECTO")).toEqual({ ok: true, to: "EN_PROYECTO" });
  });

  it("proyecto → bodega regresa a BODEGA", () => {
    expect(resolveTransition("EN_PROYECTO", "TRANSFER", "BODEGA")).toEqual({ ok: true, to: "BODEGA" });
  });

  it.each(["EXTRAVIADA", "DANADA", "EN_MANTENIMIENTO", "DADA_DE_BAJA"] as const)(
    "no se puede trasladar una herramienta %s",
    (status) => {
      const r = resolveTransition(status, "TRANSFER", "PROYECTO");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("INVALID_TRANSITION");
    },
  );

  it("un traslado sin destino se rechaza", () => {
    const r = resolveTransition("BODEGA", "TRANSFER");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("DESTINATION_REQUIRED");
  });

  it("al terminar el mantenimiento solo puede volver a una bodega", () => {
    expect(resolveTransition("EN_MANTENIMIENTO", "MAINTENANCE_END", "BODEGA")).toEqual({ ok: true, to: "BODEGA" });
    const r = resolveTransition("EN_MANTENIMIENTO", "MAINTENANCE_END", "PROYECTO");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("INVALID_DESTINATION");
  });

  it("una herramienta irreparable en mantenimiento pasa a DANADA", () => {
    expect(resolveTransition("EN_MANTENIMIENTO", "DAMAGE")).toEqual({ ok: true, to: "DANADA" });
  });

  it("una extraviada recuperada vuelve a BODEGA", () => {
    expect(resolveTransition("EXTRAVIADA", "RECOVERY", "BODEGA")).toEqual({ ok: true, to: "BODEGA" });
  });

  it("solo dañadas o extraviadas se pueden dar de baja", () => {
    expect(resolveTransition("DANADA", "DECOMMISSION").ok).toBe(true);
    expect(resolveTransition("EXTRAVIADA", "DECOMMISSION").ok).toBe(true);
    expect(resolveTransition("BODEGA", "DECOMMISSION").ok).toBe(false);
  });

  it("no se puede reportar extraviada una herramienta en mantenimiento", () => {
    expect(resolveTransition("EN_MANTENIMIENTO", "LOSS").ok).toBe(false);
  });
});

describe("availableEvents / isTerminal", () => {
  it("DADA_DE_BAJA es terminal", () => {
    expect(isTerminal("DADA_DE_BAJA")).toBe(true);
    expect(availableEvents("DADA_DE_BAJA")).toEqual([]);
  });

  it("EXTRAVIADA solo admite recuperar o dar de baja", () => {
    expect(availableEvents("EXTRAVIADA").sort()).toEqual(["DECOMMISSION", "RECOVERY"]);
  });
});
