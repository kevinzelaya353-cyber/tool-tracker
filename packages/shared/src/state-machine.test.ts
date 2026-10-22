import { describe, expect, it } from "vitest";
import { availableEvents, canReportDamage, isTerminal, resolveTransition } from "./state-machine.js";

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

describe("traslado con chofer", () => {
  it("la salida deja la herramienta en tránsito", () => {
    expect(resolveTransition("BODEGA", "DISPATCH")).toEqual({ ok: true, to: "EN_TRANSITO" });
    expect(resolveTransition("EN_PROYECTO", "DISPATCH")).toEqual({ ok: true, to: "EN_TRANSITO" });
  });

  it("en tránsito solo puede llegar a destino: no sale otra vez ni admite eventos manuales", () => {
    expect(resolveTransition("EN_TRANSITO", "TRANSFER", "PROYECTO")).toEqual({ ok: true, to: "EN_PROYECTO" });
    expect(resolveTransition("EN_TRANSITO", "DISPATCH").ok).toBe(false);
    expect(availableEvents("EN_TRANSITO")).toEqual(["TRANSFER"]);
  });

  it("dañada, en mantenimiento o extraviada no puede salir con chofer", () => {
    for (const s of ["DANADA", "EN_MANTENIMIENTO", "EXTRAVIADA", "DADA_DE_BAJA"] as const) {
      expect(resolveTransition(s, "DISPATCH").ok).toBe(false);
    }
  });
});

describe("alquileres", () => {
  it("una herramienta devuelta solo puede volver a recibirse en un nuevo alquiler", () => {
    expect(availableEvents("DEVUELTA")).toEqual(["RENTAL_RECEIVE"]);
    expect(isTerminal("DEVUELTA")).toBe(false);
  });

  it("al recibirla queda en bodega o directo en el proyecto", () => {
    expect(resolveTransition("DEVUELTA", "RENTAL_RECEIVE", "BODEGA")).toEqual({ ok: true, to: "BODEGA" });
    expect(resolveTransition("DEVUELTA", "RENTAL_RECEIVE", "PROYECTO")).toEqual({ ok: true, to: "EN_PROYECTO" });
    const r = resolveTransition("DEVUELTA", "RENTAL_RECEIVE");
    expect(r.ok).toBe(false);
  });

  it.each(["BODEGA", "EN_PROYECTO", "DANADA"] as const)("se puede devolver desde %s", (status) => {
    expect(resolveTransition(status, "RENTAL_RETURN")).toEqual({ ok: true, to: "DEVUELTA" });
  });

  it.each(["EN_TRANSITO", "EXTRAVIADA", "DADA_DE_BAJA", "DEVUELTA"] as const)("no se puede devolver desde %s", (status) => {
    expect(resolveTransition(status, "RENTAL_RETURN").ok).toBe(false);
  });

  it("una herramienta devuelta no se traslada ni se reporta", () => {
    expect(resolveTransition("DEVUELTA", "TRANSFER", "PROYECTO").ok).toBe(false);
    expect(resolveTransition("DEVUELTA", "DAMAGE").ok).toBe(false);
  });
});

describe("canReportDamage", () => {
  it("permite reportar daños nuevos aunque ya esté dañada", () => {
    expect(canReportDamage("DANADA")).toBe(true);
    expect(canReportDamage("EN_TRANSITO")).toBe(true);
  });

  it.each(["EXTRAVIADA", "DADA_DE_BAJA", "DEVUELTA"] as const)("no aplica a una herramienta %s", (status) => {
    expect(canReportDamage(status)).toBe(false);
  });
});
