import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import type { ToolStatus } from "@tt/shared";
import { describe, expect, it } from "vitest";
import { ExportService, STATUS_TONE, mapUrl, routeUrl, sheetName } from "./export.service.js";

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

describe("colores por estado en el libro", () => {
  const tool = (code: string, status: ToolStatus, events: unknown[] = []) => ({
    id: code,
    code,
    status,
    brand: "Makita",
    model: null,
    serial: null,
    supplier: null,
    purchasePrice: 100,
    purchaseDate: new Date("2026-01-01"),
    coverPhotoId: null,
    category: { name: "Taladro" },
    currentLocation: { name: "Bodega" },
    currentCustodian: null,
    events,
  });
  const lossEvent = {
    type: "LOSS",
    occurredAt: new Date("2026-02-01"),
    description: "No apareció",
    location: null,
    reportedBy: { name: "Ana" },
    photos: [],
    transfer: null,
  };
  const tools = [tool("T-1", "BODEGA"), tool("T-2", "EXTRAVIADA", [lossEvent])];
  const prisma = {
    location: { findMany: async () => [{ name: "Bodega", type: "BODEGA", address: null, latitude: null, longitude: null, tools }] },
    tool: { findMany: async () => tools },
    transfer: { findMany: async () => [] },
    photo: { findMany: async () => [] },
  } as unknown as PrismaClient;

  const fillOf = (cell: ExcelJS.Cell) => (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

  it("extraviada en rojo, disponible en verde, con cuadrícula y filtros", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await new ExportService(prisma).inventoryWorkbook()) as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet("Herramientas")!;
    const status = ws.getRow(1).values as unknown[];
    const col = status.indexOf("Estado");
    expect(fillOf(ws.getRow(2).getCell(col))).toBe(STATUS_TONE.BODEGA.strong);
    expect(fillOf(ws.getRow(3).getCell(col))).toBe(STATUS_TONE.EXTRAVIADA.strong);
    expect(fillOf(ws.getRow(3).getCell(1))).toBe(STATUS_TONE.EXTRAVIADA.tint);
    expect(ws.getRow(2).getCell(1).border?.bottom?.style).toBe("thin");
    expect(ws.autoFilter).toBeTruthy();

    const hist = wb.getWorksheet("Historial")!;
    const lossRow = hist.getRows(1, hist.rowCount)!.find((r) => r.getCell(2).value === "Reporte de extravío")!;
    expect(fillOf(lossRow.getCell(2))).toBe(STATUS_TONE.EXTRAVIADA.strong);
  });
});
