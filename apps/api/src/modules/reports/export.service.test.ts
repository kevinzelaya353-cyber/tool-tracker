import { describe, expect, it } from "vitest";
import { sheetName } from "./export.service.js";

describe("sheetName", () => {
  it("quita caracteres prohibidos y recorta a 31", () => {
    const used = new Set<string>();
    expect(sheetName("Obra: Torre [A] / Fase 1?", used)).toBe("Obra- Torre -A- - Fase 1-");
    expect(sheetName("x".repeat(40), used)).toHaveLength(31);
  });

  it("evita nombres repetidos (sin distinguir mayúsculas)", () => {
    const used = new Set<string>();
    expect(sheetName("Bodega Central", used)).toBe("Bodega Central");
    expect(sheetName("bodega central", used)).toBe("bodega central (2)");
    expect(sheetName("BODEGA CENTRAL", used)).toBe("BODEGA CENTRAL (3)");
  });

  it("usa un nombre por defecto si queda vacío", () => {
    expect(sheetName("''", new Set())).toBe("Sin nombre");
  });
});
