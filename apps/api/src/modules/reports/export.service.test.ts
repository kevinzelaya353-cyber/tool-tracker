import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import type { ToolStatus } from "@tt/shared";
import { describe, expect, it } from "vitest";
import { ExportService, STATUS_TONE, bitacoraEntries, mapUrl, routeUrl, sheetName, wallClock } from "./export.service.js";

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
    createdAt: new Date("2026-02-01"),
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

describe("bitácora", () => {
  const ev = (type: "DAMAGE" | "TRANSFER", at: string, by: string, transfer: unknown = null) => ({
    type,
    occurredAt: new Date(at),
    createdAt: new Date(at),
    description: null,
    location: null,
    reportedBy: { name: by },
    photos: [],
    transfer,
  });
  const transfer = {
    movedAt: new Date("2026-03-02T19:00:00Z"),
    createdAt: new Date("2026-03-02T19:00:00Z"),
    createdBy: { name: "Kevin" },
    fromLocation: { name: "Bodega" },
    toLocation: { name: "Obra A" },
    deliveredBy: { name: "Kevin" },
    receivedBy: { name: "Mario" },
    driver: null as { name: string } | null,
    receivedAt: new Date("2026-03-02T19:00:00Z") as Date | null,
    receptionRecordedAt: null as Date | null,
    receptionBy: null as { name: string } | null,
    receptionMethod: null as "SESION" | "PIN" | "SUPERVISION" | null,
    receptionNotes: null as string | null,
    notes: null,
    photos: [{ stage: "ENTREGA" }, { stage: "ENTREGA" }] as { stage: string | null }[],
    items: [
      { outcome: null, tool: { code: "T-1" } },
      { outcome: null, tool: { code: "T-2" } },
    ] as { outcome: "RECIBIDA" | "DANADA" | "NO_LLEGO" | null; tool: { code: string } }[],
  };

  it("intercala a todos los usuarios por fecha y hora, no por usuario", () => {
    const tools = [
      { code: "T-1", events: [ev("DAMAGE", "2026-03-02T20:00:00Z", "Mario"), ev("TRANSFER", "2026-03-02T19:00:00Z", "Kevin", {})] },
      { code: "T-2", events: [ev("DAMAGE", "2026-03-02T21:00:00Z", "Kevin"), ev("TRANSFER", "2026-03-02T19:00:00Z", "Kevin", {})] },
    ];
    const log = bitacoraEntries(tools, [transfer]);
    expect(log.map((e) => [e.by, e.kind])).toEqual([
      ["Kevin", "Traslado"],
      ["Mario", "Reporte de daño"],
      ["Kevin", "Reporte de daño"],
    ]);
    // El traslado de dos herramientas es una sola entrada.
    expect(log[0]).toMatchObject({ tools: "T-1, T-2", people: "Kevin → Mario", photos: 2 });
  });

  it("con chofer: la salida y la recepción son dos entradas, cada una con su hora y su autor", () => {
    const withDriver = {
      ...transfer,
      createdBy: { name: "Pedro" },
      driver: { name: "Luis" },
      receivedAt: new Date("2026-03-02T22:30:00Z"),
      receptionRecordedAt: new Date("2026-03-03T01:00:00Z"), // se sincronizó después
      receptionBy: { name: "Luis" },
      receptionMethod: "PIN" as const,
      photos: [{ stage: "ENTREGA" }, { stage: "RECEPCION" }, { stage: "RECEPCION" }],
      items: [
        { outcome: "RECIBIDA" as const, tool: { code: "T-1" } },
        { outcome: "NO_LLEGO" as const, tool: { code: "T-2" } },
      ],
    };
    const log = bitacoraEntries([], [withDriver]);
    expect(log.map((e) => [e.at.toISOString(), e.by, e.kind])).toEqual([
      ["2026-03-02T19:00:00.000Z", "Pedro", "Salida con chofer"],
      ["2026-03-02T22:30:00.000Z", "Luis", "Recepción"],
    ]);
    expect(log[0]).toMatchObject({ photos: 1, people: "Kevin entregó a Luis (chofer)" });
    expect(log[1]).toMatchObject({
      photos: 2,
      people: "Luis entregó a Mario (confirmó con su PIN en otro teléfono)",
      notes: "1 llegó bien, 1 no llegó",
      recordedAt: new Date("2026-03-03T01:00:00Z"),
    });
  });

  it("en tránsito: solo la salida", () => {
    const pending = { ...transfer, driver: { name: "Luis" }, receivedAt: null };
    expect(bitacoraEntries([], [pending]).map((e) => e.kind)).toEqual(["Salida con chofer"]);
  });

  it("muestra la hora local de la zona de reportes", () => {
    // 19:00 UTC = 1:00 p. m. en Honduras (UTC-6, sin horario de verano).
    expect(wallClock(new Date("2026-03-02T19:00:00Z"), "America/Tegucigalpa").toISOString()).toBe("2026-03-02T13:00:00.000Z");
    expect(wallClock(new Date("2026-03-02T19:00:00Z"), "UTC").toISOString()).toBe("2026-03-02T19:00:00.000Z");
  });
});
