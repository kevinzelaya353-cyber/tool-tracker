import { describe, expect, it } from "vitest";
import { mapUrl, routeUrl, sheetName } from "./export.service.js";

describe("enlaces de mapa", () => {
  const a = { latitude: 14.07, longitude: -87.19 };
  const b = { latitude: 14.46, longitude: -87.64 };

  it("arma el enlace al punto y a la ruta en OpenStreetMap", () => {
    expect(mapUrl(a)).toBe("https://www.openstreetmap.org/?mlat=14.07&mlon=-87.19#map=17/14.07/-87.19");
    expect(routeUrl(a, b)).toBe(
      "https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=14.07%2C-87.19%3B14.46%2C-87.64",
    );
  });

  it("sin coordenadas no hay enlace", () => {
    expect(mapUrl({ latitude: null, longitude: null })).toBeNull();
    expect(routeUrl(a, { latitude: null, longitude: null })).toBeNull();
  });
});

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
