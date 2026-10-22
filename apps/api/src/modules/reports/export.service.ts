import type { PhotoStage, Prisma, PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import {
  ITEM_OUTCOME,
  TOOL_STATUS,
  TOOL_STATUS_LABEL,
  type EventType,
  type ItemOutcome,
  type ReceptionMethod,
  type ToolStatus,
} from "@tt/shared";
import type { ObjectStorage } from "../media/storage.js";
import { photoDistances } from "../../lib/geo.js";

const MONEY_FMT = '"L" #,##0.00';
const DATE_FMT = "dd/mm/yyyy";
const DATETIME_FMT = "dd/mm/yyyy hh:mm";
const PHOTO_PX = 76;
const ROW_PT = 62; // alto de fila (puntos) para que quepa la miniatura
const MINI_PX = 56; // miniaturas del historial (varias por celda)
const MINI_ROW_PT = 46;
const PHOTOS_PER_CELL = 3;
const PHOTOS_COL_WIDTH = 27; // ~3 miniaturas de 56 px

const HEADER_FILL = "FFF59E0B";
const BAND_FILL = "FFFEF3C7";
const ZEBRA_FILL = "FFF7F7F7";
const BORDER_COLOR = "FFBFBFBF";

/** Color fuerte para la celda de estado, tono suave para el resto de la fila. */
type Tone = { strong: string; font: string; tint: string };

export const STATUS_TONE: Record<ToolStatus, Tone> = {
  BODEGA: { strong: "FF2E7D32", font: "FFFFFFFF", tint: "FFE8F5E9" }, // verde: disponible, en buen estado
  EN_PROYECTO: { strong: "FF1565C0", font: "FFFFFFFF", tint: "FFE3F2FD" }, // azul: en uso
  EN_TRANSITO: { strong: "FF00838F", font: "FFFFFFFF", tint: "FFE0F7FA" }, // turquesa: en el camión
  EN_MANTENIMIENTO: { strong: "FFF9A825", font: "FF3E2723", tint: "FFFFF8E1" }, // amarillo
  DANADA: { strong: "FFE65100", font: "FFFFFFFF", tint: "FFFFF3E0" }, // naranja
  EXTRAVIADA: { strong: "FFC62828", font: "FFFFFFFF", tint: "FFFFEBEE" }, // rojo
  DADA_DE_BAJA: { strong: "FF616161", font: "FFFFFFFF", tint: "FFEEEEEE" }, // gris
  DEVUELTA: { strong: "FF6A1B9A", font: "FFFFFFFF", tint: "FFF3E5F5" }, // morado: rentada, ya devuelta
};

/** Movimientos del historial coloreados según el estado al que llevan (los traslados no se colorean). */
const EVENT_TONE: Partial<Record<EventType, Tone>> = {
  PURCHASE: STATUS_TONE.BODEGA,
  DISPATCH: STATUS_TONE.EN_TRANSITO,
  MAINTENANCE_START: STATUS_TONE.EN_MANTENIMIENTO,
  MAINTENANCE_END: STATUS_TONE.BODEGA,
  DAMAGE: STATUS_TONE.DANADA,
  LOSS: STATUS_TONE.EXTRAVIADA,
  RECOVERY: STATUS_TONE.BODEGA,
  DECOMMISSION: STATUS_TONE.DADA_DE_BAJA,
  RENTAL_RETURN: STATUS_TONE.DEVUELTA,
};

const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: BORDER_COLOR } };
const GRID: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const EVENT_LABEL: Record<EventType, string> = {
  PURCHASE: "Alta (compra)",
  DISPATCH: "Salida con chofer",
  TRANSFER: "Traslado",
  MAINTENANCE_START: "Enviada a mantenimiento",
  MAINTENANCE_END: "Mantenimiento finalizado",
  DAMAGE: "Reporte de daño",
  LOSS: "Reporte de extravío",
  RECOVERY: "Recuperada",
  DECOMMISSION: "Dada de baja",
  RENTAL_RECEIVE: "Recibida en alquiler",
  RENTAL_RETURN: "Devuelta al arrendador",
};

const EVIDENCE_PHOTO = { storageKey: true, thumbKey: true, hiddenAt: true } as const;

const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: "Código", key: "code", width: 14 },
  { header: "Tipo", key: "category", width: 20 },
  { header: "Marca", key: "brand", width: 16 },
  { header: "Modelo", key: "model", width: 16 },
  { header: "Serie", key: "serial", width: 18 },
  { header: "Estado", key: "status", width: 18 },
  { header: "A cargo de", key: "custodian", width: 22 },
  { header: "Precio de compra", key: "price", width: 16, style: { numFmt: MONEY_FMT } },
  { header: "Fecha de compra", key: "purchaseDate", width: 15, style: { numFmt: DATE_FMT } },
  { header: "Proveedor", key: "supplier", width: 20 },
  { header: "Foto", key: "photo", width: 13 },
];
const RECEPTION_LABEL: Record<ReceptionMethod, string> = {
  SESION: "en su sesión",
  PIN: "con su PIN en otro teléfono",
  SUPERVISION: "por un supervisor",
};

/** Singular y plural de cada resultado: "1 llegó bien", "2 llegaron bien". */
const OUTCOME_TEXT: Record<ItemOutcome, [string, string]> = {
  RECIBIDA: ["llegó bien", "llegaron bien"],
  DANADA: ["llegó dañada", "llegaron dañadas"],
  NO_LLEGO: ["no llegó", "no llegaron"],
};

/** "2 llegaron bien, 1 no llegó" a partir del resultado de cada herramienta. */
export function outcomeSummary(outcomes: (ItemOutcome | null)[]): string {
  return ITEM_OUTCOME.map((o) => [o, outcomes.filter((x) => x === o).length] as const)
    .filter(([, n]) => n > 0)
    .map(([o, n]) => `${n} ${OUTCOME_TEXT[o][n === 1 ? 0 : 1]}`)
    .join(", ");
}

/** Horas en camino a partir de las cuales un traslado se marca en rojo. */
export const TRANSIT_ALERT_HOURS = 24;

const PHOTO_COL = COLUMNS.length - 1; // índice 0-based de la columna "Foto"
const STATUS_COL = COLUMNS.findIndex((c) => c.key === "status") + 1; // 1-based, igual en "Herramientas"

type Point = { latitude: number | null; longitude: number | null };
const hasPoint = (p: Point): p is { latitude: number; longitude: number } => p.latitude != null && p.longitude != null;

/** Enlace a OpenStreetMap con el punto marcado. */
export function mapUrl(p: Point): string | null {
  if (!hasPoint(p)) return null;
  return `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`;
}

/** Enlace a la ruta en coche entre dos puntos en OpenStreetMap. */
export function routeUrl(from: Point, to: Point): string | null {
  if (!hasPoint(from) || !hasPoint(to)) return null;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.latitude}%2C${from.longitude}%3B${to.latitude}%2C${to.longitude}`;
}

/** Nombre de pestaña válido en Excel: sin []:*?/\, máx. 31 caracteres y único en el libro. */
export function sheetName(raw: string, used: Set<string>): string {
  const base = raw.replace(/[[\]:*?/\\]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Sin nombre";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

function styleHeader(ws: ExcelJS.Worksheet, row = 1, cols = ws.columns.length) {
  const header = ws.getRow(row);
  header.height = 30;
  for (let c = 1; c <= cols; c++) {
    const cell = header.getCell(c);
    cell.font = { bold: true, color: { argb: "FF1F1300" } };
    cell.fill = solid(HEADER_FILL);
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: THIN, left: THIN, right: THIN, bottom: { style: "medium", color: { argb: "FF7A4F01" } } };
  }
  if (row === 1) ws.views = [{ state: "frozen", ySplit: row }];
}

/** Tiñe la fila con el tono del estado y resalta su celda de estado. */
function paintRow(row: ExcelJS.Row, cols: number, tone: Tone, statusCol: number) {
  for (let c = 1; c <= cols; c++) row.getCell(c).fill = solid(tone.tint);
  const cell = row.getCell(statusCol);
  cell.fill = solid(tone.strong);
  cell.font = { bold: true, color: { argb: tone.font } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

/**
 * Formato de tabla para las filas de datos: cuadrícula en cada celda y filas alternas
 * en gris claro (si la fila no tiene ya un color). Las filas vacías quedan como separadores.
 */
function gridTable(ws: ExcelJS.Worksheet, from: number, to: number, cols = ws.columns.length, opts: { filter?: boolean } = {}) {
  let data = 0;
  for (let r = from + 1; r <= to; r++) {
    const row = ws.getRow(r);
    if (!row.hasValues) continue;
    const zebra = data++ % 2 === 1;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.border = GRID;
      if (zebra && !cell.fill) cell.fill = solid(ZEBRA_FILL);
    }
  }
  if (opts.filter && to > from) ws.autoFilter = { from: { row: from, column: 1 }, to: { row: from, column: cols } };
}

const link = (url: string | null, text: string): ExcelJS.CellValue => (url ? { text, hyperlink: url } : "");
/**
 * ExcelJS escribe las fechas en UTC: se pasan a la hora local de la zona de reportes
 * para que la celda muestre la hora que vio quien registró el movimiento.
 */
export function wallClock(d: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return new Date(Date.UTC(p.year!, p.month! - 1, p.day!, p.hour!, p.minute!, p.second!, d.getUTCMilliseconds()));
}

/** "sábado, 18 de octubre de 2026" en la zona de reportes. */
function dayLabel(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat("es-HN", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Una fila de la bitácora: lo que pasó, cuándo y quién lo registró. */
export interface LogEntry {
  at: Date;
  recordedAt: Date;
  by: string;
  kind: string;
  tools: string;
  from: string;
  to: string;
  people: string;
  notes: string;
  photos: number;
  tone?: Tone;
}

type LogTool = {
  code: string;
  events: {
    type: EventType;
    occurredAt: Date;
    createdAt: Date;
    description: string | null;
    location: { name: string } | null;
    reportedBy: { name: string };
    photos: unknown[];
    transfer: unknown;
  }[];
};
type LogTransfer = {
  movedAt: Date;
  createdAt: Date;
  createdBy: { name: string };
  driver: { name: string } | null;
  receivedAt: Date | null;
  receptionRecordedAt: Date | null;
  receptionBy: { name: string } | null;
  receptionMethod: ReceptionMethod | null;
  receptionNotes: string | null;
  fromLocation: { name: string };
  toLocation: { name: string };
  deliveredBy: { name: string };
  receivedBy: { name: string };
  notes: string | null;
  photos: { stage: string | null }[];
  items: { outcome: ItemOutcome | null; tool: { code: string } }[];
};

/**
 * Todos los movimientos de todos los usuarios en una sola línea de tiempo, del más antiguo al más reciente.
 * Un traslado es una sola entrada aunque lleve varias herramientas; con chofer son dos: la salida y la
 * recepción (cada una con su hora y quien la registró). El resto de eventos, una por herramienta.
 */
export function bitacoraEntries(tools: LogTool[], transfers: LogTransfer[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const tr of transfers) {
    const codes = tr.items.map((i) => i.tool.code).join(", ");
    const delivery = tr.photos.filter((p) => p.stage !== "RECEPCION").length;
    const reception = tr.photos.length - delivery;
    if (!tr.driver) {
      entries.push({
        at: tr.movedAt,
        recordedAt: tr.createdAt,
        by: tr.createdBy.name,
        kind: EVENT_LABEL.TRANSFER,
        tools: codes,
        from: tr.fromLocation.name,
        to: tr.toLocation.name,
        people: `${tr.deliveredBy.name} → ${tr.receivedBy.name}`,
        notes: tr.notes ?? "",
        photos: tr.photos.length,
      });
      continue;
    }
    entries.push({
      at: tr.movedAt,
      recordedAt: tr.createdAt,
      by: tr.createdBy.name,
      kind: EVENT_LABEL.DISPATCH,
      tools: codes,
      from: tr.fromLocation.name,
      to: tr.toLocation.name,
      people: `${tr.deliveredBy.name} entregó a ${tr.driver.name} (chofer)`,
      notes: tr.notes ?? "",
      photos: delivery,
      tone: STATUS_TONE.EN_TRANSITO,
    });
    if (tr.receivedAt) {
      const summary = outcomeSummary(tr.items.map((i) => i.outcome));
      entries.push({
        at: tr.receivedAt,
        recordedAt: tr.receptionRecordedAt ?? tr.receivedAt,
        by: tr.receptionBy?.name ?? tr.receivedBy.name,
        kind: "Recepción",
        tools: codes,
        from: tr.fromLocation.name,
        to: tr.toLocation.name,
        people:
          `${tr.driver.name} entregó a ${tr.receivedBy.name}` +
          (tr.receptionMethod ? ` (confirmó ${RECEPTION_LABEL[tr.receptionMethod]})` : ""),
        notes: [summary, tr.receptionNotes].filter(Boolean).join(". "),
        photos: reception,
      });
    }
  }
  for (const t of tools) {
    for (const e of t.events) {
      if (e.transfer) continue; // ya está como salida, recepción o traslado
      entries.push({
        at: e.occurredAt,
        recordedAt: e.createdAt,
        by: e.reportedBy.name,
        kind: EVENT_LABEL[e.type],
        tools: t.code,
        from: "",
        to: e.location?.name ?? "",
        people: "",
        notes: e.description ?? "",
        photos: e.photos.length,
        tone: EVENT_TONE[e.type],
      });
    }
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime() || a.recordedAt.getTime() - b.recordedAt.getTime());
}

const km = (m: number | null) => (m == null ? null : Math.round(m / 100) / 10);
const duration = (s: number | null) => {
  if (s == null) return "";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

const TRANSFER_SELECT = {
  id: true,
  movedAt: true,
  createdAt: true,
  createdBy: { select: { name: true } },
  driver: { select: { name: true } },
  status: true,
  receivedAt: true,
  receptionRecordedAt: true,
  receptionBy: { select: { name: true } },
  receptionMethod: true,
  receptionNotes: true,
  notes: true,
  routeDistanceM: true,
  routeDurationS: true,
  fromLocation: { select: { name: true, latitude: true, longitude: true } },
  toLocation: { select: { name: true, latitude: true, longitude: true } },
  deliveredBy: { select: { name: true } },
  receivedBy: { select: { name: true } },
  vehicle: { select: { plate: true } },
  // Incluye las fotos eliminadas desde la app: el Excel conserva todo el historial.
  photos: {
    select: { storageKey: true, thumbKey: true, stage: true, hiddenAt: true, latitude: true, longitude: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TransferSelect;

/**
 * Libro de Excel del inventario:
 * - Resumen por ubicación (con enlace al mapa).
 * - Bitácora: todos los movimientos de todos los usuarios en orden de fecha y hora.
 * - En tránsito: lo que va en camino con cada chofer y desde hace cuánto.
 * - Herramientas: todas, con su foto.
 * - Historial: por herramienta, cada movimiento con fecha, origen → destino, personas y fotos de entrega/recepción.
 * - Traslados: uno por fila, filtrable, con distancia y enlace a la ruta.
 * - Una pestaña por ubicación (proyectos primero, luego bodegas) con sus herramientas actuales.
 */
export class ExportService {
  private images = new Map<string, Promise<number | null>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage?: ObjectStorage,
    /** Zona horaria (IANA) en la que se muestran las horas del libro. */
    private readonly tz = "UTC",
  ) {}

  async inventoryWorkbook(): Promise<Buffer> {
    this.images.clear();
    const [locations, tools, transfers] = await Promise.all([
      this.prisma.location.findMany({
        where: { active: true },
        orderBy: [{ type: "desc" }, { name: "asc" }], // PROYECTO antes que BODEGA
        include: {
          tools: {
            orderBy: { code: "asc" },
            include: { category: true, currentCustodian: { select: { name: true } } },
          },
        },
      }),
      this.prisma.tool.findMany({
        orderBy: { code: "asc" },
        include: {
          category: true,
          currentLocation: { select: { name: true } },
          currentCustodian: { select: { name: true } },
          events: {
            orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
            include: {
              location: { select: { name: true } },
              reportedBy: { select: { name: true } },
              photos: { select: EVIDENCE_PHOTO, orderBy: { createdAt: "asc" } },
              transfer: { select: TRANSFER_SELECT },
              // Evidencia guardada en el reporte de daño o en el alquiler que originó el evento.
              damageReport: { select: { photos: { select: EVIDENCE_PHOTO, orderBy: { createdAt: "asc" } } } },
              rentalReceive: { select: { photos: { where: { stage: "RECEPCION" }, select: EVIDENCE_PHOTO, orderBy: { createdAt: "asc" } } } },
              rentalReturn: { select: { photos: { where: { stage: "DEVOLUCION" }, select: EVIDENCE_PHOTO, orderBy: { createdAt: "asc" } } } },
            },
          },
        },
      }),
      this.prisma.transfer.findMany({
        orderBy: { movedAt: "desc" },
        select: { ...TRANSFER_SELECT, items: { select: { outcome: true, tool: { select: { code: true } } } } },
      }),
    ]);

    const photoKeys = await this.toolPhotoKeys(tools.map((t) => ({ id: t.id, coverPhotoId: t.coverPhotoId })));

    const wb = new ExcelJS.Workbook();
    wb.creator = "Control de Herramientas";
    wb.created = new Date();
    const used = new Set<string>();

    // ---------- Resumen ----------
    const summary = wb.addWorksheet(sheetName("Resumen", used));
    summary.columns = [
      { header: "Ubicación", key: "name", width: 30 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Dirección", key: "address", width: 40 },
      { header: "Herramientas", key: "count", width: 14 },
      { header: "Valor de compra", key: "value", width: 18, style: { numFmt: MONEY_FMT } },
      { header: "Mapa", key: "map", width: 16 },
    ];
    styleHeader(summary);
    for (const loc of locations) {
      summary.addRow({
        name: loc.name,
        type: loc.type === "PROYECTO" ? "Proyecto" : "Bodega",
        address: loc.address ?? "",
        count: loc.tools.length,
        value: loc.tools.reduce((s, t) => s + Number(t.purchasePrice), 0),
        map: link(mapUrl(loc), "Ver en mapa"),
      });
    }
    if (locations.length) {
      const last = summary.rowCount;
      const total = summary.addRow({
        name: "Total",
        count: { formula: `SUM(D2:D${last})` },
        value: { formula: `SUM(E2:E${last})` },
      });
      gridTable(summary, 1, last);
      for (let c = 1; c <= summary.columns.length; c++) {
        const cell = total.getCell(c);
        cell.font = { bold: true };
        cell.fill = solid(BAND_FILL);
        cell.border = { ...GRID, top: { style: "medium", color: { argb: "FF7A4F01" } } };
      }
    }

    // Leyenda de colores con el conteo de herramientas por estado.
    summary.addRow([]);
    const legendHeader = summary.addRow(["Estado", "Herramientas"]);
    styleHeader(summary, legendHeader.number, 2);
    for (const status of TOOL_STATUS) {
      const row = summary.addRow([TOOL_STATUS_LABEL[status], tools.filter((t) => t.status === status).length]);
      paintRow(row, 2, STATUS_TONE[status], 1);
      row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
    }
    gridTable(summary, legendHeader.number, summary.rowCount, 2);

    // ---------- Bitácora ----------
    const log = wb.addWorksheet(sheetName("Bitácora", used));
    log.columns = [
      { header: "Fecha y hora", key: "at", width: 18, style: { numFmt: DATETIME_FMT } },
      { header: "Registrado por", key: "by", width: 20 },
      { header: "Movimiento", key: "kind", width: 22 },
      { header: "Herramientas", key: "tools", width: 24 },
      { header: "Desde", key: "from", width: 22 },
      { header: "Hacia", key: "to", width: 22 },
      { header: "Entregó → Recibió", key: "people", width: 28 },
      { header: "Notas", key: "notes", width: 30 },
      { header: "Fotos", key: "photos", width: 8 },
      { header: "Registrado en la app", key: "recordedAt", width: 18, style: { numFmt: DATETIME_FMT } },
    ];
    styleHeader(log);
    const logCols = log.columns.length;
    let lastDay = "";
    for (const e of bitacoraEntries(tools, transfers)) {
      // Franja por día: la bitácora se lee por fecha, no por usuario.
      const day = dayLabel(e.at, this.tz);
      if (day !== lastDay) {
        lastDay = day;
        const band = log.addRow([day]);
        log.mergeCells(band.number, 1, band.number, logCols);
        band.font = { bold: true, size: 12 };
        band.fill = solid(BAND_FILL);
        band.height = 22;
        band.alignment = { vertical: "middle" };
      }
      const row = log.addRow({ ...e, at: wallClock(e.at, this.tz), recordedAt: wallClock(e.recordedAt, this.tz), tone: undefined });
      row.alignment = { vertical: "top", wrapText: true };
      row.getCell(1).font = { bold: true };
      if (e.tone) paintRow(row, logCols, e.tone, 3);
    }
    gridTable(log, 1, log.rowCount, logCols, { filter: true });

    // ---------- En tránsito ----------
    const transit = wb.addWorksheet(sheetName("En tránsito", used));
    transit.columns = [
      { header: "Salió", key: "movedAt", width: 18, style: { numFmt: DATETIME_FMT } },
      { header: "Horas en camino", key: "hours", width: 12, style: { numFmt: "0.0" } },
      { header: "Chofer", key: "driver", width: 20 },
      { header: "Vehículo", key: "vehicle", width: 11 },
      { header: "Desde", key: "from", width: 22 },
      { header: "Hacia", key: "to", width: 22 },
      { header: "Debe recibir", key: "receiver", width: 20 },
      { header: "Herramientas", key: "tools", width: 28 },
    ];
    styleHeader(transit);
    const now = Date.now();
    const pending = transfers.filter((tr) => tr.status === "EN_TRANSITO").sort((a, b) => a.movedAt.getTime() - b.movedAt.getTime());
    for (const tr of pending) {
      const hours = (now - tr.movedAt.getTime()) / 3_600_000;
      const row = transit.addRow({
        movedAt: wallClock(tr.movedAt, this.tz),
        hours: Math.round(hours * 10) / 10,
        driver: tr.driver?.name ?? "",
        vehicle: tr.vehicle?.plate ?? "",
        from: tr.fromLocation.name,
        to: tr.toLocation.name,
        receiver: tr.receivedBy.name,
        tools: tr.items.map((i) => i.tool.code).join(", "),
      });
      row.alignment = { vertical: "top", wrapText: true };
      // Más de un día en camino: algo pasó (o nadie confirmó la llegada).
      if (hours > TRANSIT_ALERT_HOURS) paintRow(row, transit.columns.length, STATUS_TONE.EXTRAVIADA, 2);
    }
    if (pending.length === 0) transit.addRow({ movedAt: null, driver: "No hay herramientas en camino." });
    gridTable(transit, 1, transit.rowCount, transit.columns.length, { filter: pending.length > 0 });

    // ---------- Herramientas ----------
    const all = wb.addWorksheet(sheetName("Herramientas", used));
    all.columns = [
      ...COLUMNS.slice(0, 7),
      { header: "Ubicación", key: "location", width: 24 },
      ...COLUMNS.slice(7, 10),
      { header: "Traslados", key: "moves", width: 11 },
      { header: "Último movimiento", key: "lastMove", width: 17, style: { numFmt: DATETIME_FMT } },
      { header: "Foto", key: "photo", width: 13 },
    ];
    styleHeader(all);
    const allPhotoCol = all.columns.length - 1;
    for (const t of tools) {
      const last = t.events.at(-1);
      const row = all.addRow({
        code: t.code,
        category: t.category.name,
        brand: t.brand,
        model: t.model ?? "",
        serial: t.serial ?? "",
        status: TOOL_STATUS_LABEL[t.status],
        custodian: t.currentCustodian?.name ?? "",
        location: t.currentLocation?.name ?? "",
        price: Number(t.purchasePrice),
        purchaseDate: t.purchaseDate,
        supplier: t.supplier ?? "",
        moves: t.events.filter((e) => e.type === "TRANSFER").length,
        lastMove: last ? wallClock(last.occurredAt, this.tz) : null,
      });
      row.alignment = { vertical: "middle" };
      paintRow(row, all.columns.length, STATUS_TONE[t.status], STATUS_COL);
      await this.placePhoto(wb, all, row, allPhotoCol, photoKeys.get(t.id));
    }
    gridTable(all, 1, all.rowCount, all.columns.length, { filter: true });

    // ---------- Historial por herramienta ----------
    const hist = wb.addWorksheet(sheetName("Historial", used));
    hist.columns = [
      { header: "Fecha", key: "date", width: 17, style: { numFmt: DATETIME_FMT } },
      { header: "Movimiento", key: "kind", width: 22 },
      { header: "Desde", key: "from", width: 24 },
      { header: "Hacia", key: "to", width: 24 },
      { header: "Entregó", key: "delivered", width: 20 },
      { header: "Recibió", key: "received", width: 20 },
      { header: "Vehículo", key: "vehicle", width: 11 },
      { header: "Distancia (km)", key: "km", width: 13, style: { numFmt: "0.0" } },
      { header: "Ruta", key: "route", width: 12 },
      { header: "Notas", key: "notes", width: 30 },
      { header: "Fotos de entrega", key: "deliveryPhotos", width: PHOTOS_COL_WIDTH },
      { header: "Fotos de recepción", key: "receptionPhotos", width: PHOTOS_COL_WIDTH },
    ];
    styleHeader(hist);
    const lastCol = hist.columns.length;
    for (const t of tools) {
      // Franja con la herramienta: foto en A y descripción en el resto de la fila.
      const band = hist.addRow([]);
      hist.mergeCells(band.number, 2, band.number, lastCol);
      band.getCell(2).value =
        `${t.code} · ${t.category.name} ${t.brand}${t.model ? ` ${t.model}` : ""}` +
        ` — ${TOOL_STATUS_LABEL[t.status]}${t.currentLocation ? ` en ${t.currentLocation.name}` : ""}` +
        `${t.currentCustodian ? ` (a cargo de ${t.currentCustodian.name})` : ""}`;
      band.font = { bold: true, size: 12 };
      band.alignment = { vertical: "middle" };
      band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
      await this.placePhoto(wb, hist, band, 0, photoKeys.get(t.id));
      if (!photoKeys.get(t.id)) band.height = 22;

      for (const e of t.events) {
        const tr = e.transfer;
        const row = hist.addRow(
          tr
            ? {
                // La salida y la llegada de un traslado con chofer tienen cada una su hora.
                date: wallClock(e.occurredAt, this.tz),
                kind: e.type === "DISPATCH" ? EVENT_LABEL.DISPATCH : tr.driver ? "Llegada (recepción)" : EVENT_LABEL.TRANSFER,
                from: tr.fromLocation.name,
                to: tr.toLocation.name,
                delivered: e.type === "TRANSFER" && tr.driver ? tr.driver.name : tr.deliveredBy.name,
                received: e.type === "DISPATCH" && tr.driver ? `${tr.driver.name} (chofer)` : tr.receivedBy.name,
                vehicle: tr.vehicle?.plate ?? "",
                km: km(tr.routeDistanceM),
                route: link(routeUrl(tr.fromLocation, tr.toLocation), "Ver ruta"),
                notes: tr.notes ?? "",
              }
            : {
                date: wallClock(e.occurredAt, this.tz),
                kind: EVENT_LABEL[e.type],
                to: e.location?.name ?? "",
                delivered: e.reportedBy.name,
                notes: e.description ?? "",
              },
        );
        row.alignment = { vertical: "middle", wrapText: true };
        const tone = tr && e.type !== "DISPATCH" ? undefined : EVENT_TONE[e.type];
        if (tone) paintRow(row, lastCol, tone, 2);
        // Fotos sin etapa (traslados anteriores o eventos) se muestran como de entrega/evidencia.
        const evidence = [
          ...e.photos,
          ...(e.damageReport?.photos ?? []),
          ...(e.rentalReceive?.photos ?? []),
          ...(e.rentalReturn?.photos ?? []),
        ];
        const photos = tr ? tr.photos : evidence.map((p) => ({ ...p, stage: null as PhotoStage | null }));
        // Con chofer, la fila de salida lleva las fotos de entrega y la de llegada las de recepción.
        const delivery = tr?.driver && e.type === "TRANSFER" ? [] : photos.filter((p) => p.stage !== "RECEPCION");
        const reception = tr?.driver && e.type === "DISPATCH" ? [] : photos.filter((p) => p.stage === "RECEPCION");
        const placed =
          (await this.placeMiniPhotos(wb, hist, row, 10, delivery)) +
          (await this.placeMiniPhotos(wb, hist, row, 11, reception));
        if (placed) row.height = MINI_ROW_PT;
      }
      hist.addRow([]);
    }
    gridTable(hist, 1, hist.rowCount);

    // ---------- Traslados ----------
    const tws = wb.addWorksheet(sheetName("Traslados", used));
    tws.columns = [
      { header: "Fecha", key: "date", width: 17, style: { numFmt: DATETIME_FMT } },
      { header: "Desde", key: "from", width: 24 },
      { header: "Hacia", key: "to", width: 24 },
      { header: "Herramientas", key: "tools", width: 28 },
      { header: "Estado", key: "status", width: 13 },
      { header: "Entregó", key: "delivered", width: 20 },
      { header: "Chofer", key: "driver", width: 18 },
      { header: "Recibió", key: "received", width: 20 },
      { header: "Llegada", key: "receivedAt", width: 17, style: { numFmt: DATETIME_FMT } },
      { header: "Resultado", key: "outcome", width: 24 },
      { header: "Vehículo", key: "vehicle", width: 11 },
      { header: "Distancia (km)", key: "km", width: 13, style: { numFmt: "0.0" } },
      { header: "Duración aprox.", key: "duration", width: 14 },
      { header: "Ruta", key: "route", width: 12 },
      { header: "Fotos", key: "photos", width: 8 },
      { header: "Foto de recepción a (m) del destino", key: "receptionM", width: 16 },
      { header: "Notas", key: "notes", width: 30 },
    ];
    styleHeader(tws);
    for (const tr of transfers) {
      const row = tws.addRow({
        date: wallClock(tr.movedAt, this.tz),
        from: tr.fromLocation.name,
        to: tr.toLocation.name,
        tools: tr.items.map((i) => i.tool.code).join(", "),
        status: tr.status === "EN_TRANSITO" ? "En tránsito" : "Recibido",
        delivered: tr.deliveredBy.name,
        driver: tr.driver?.name ?? "",
        received: tr.receivedBy.name,
        receivedAt: tr.receivedAt ? wallClock(tr.receivedAt, this.tz) : null,
        outcome: outcomeSummary(tr.items.map((i) => i.outcome)),
        vehicle: tr.vehicle?.plate ?? "",
        km: km(tr.routeDistanceM),
        duration: duration(tr.routeDurationS),
        route: link(routeUrl(tr.fromLocation, tr.toLocation), "Ver ruta"),
        photos: tr.photos.length,
        receptionM: photoDistances(tr.photos, tr.toLocation, tr.toLocation).receptionM,
        notes: [tr.notes, tr.receptionNotes].filter(Boolean).join(" · "),
      });
      row.alignment = { vertical: "top", wrapText: true };
      if (tr.status === "EN_TRANSITO") paintRow(row, tws.columns.length, STATUS_TONE.EN_TRANSITO, 5);
    }
    gridTable(tws, 1, tws.rowCount, tws.columns.length, { filter: true });

    // ---------- Una pestaña por ubicación ----------
    for (const loc of locations) {
      const ws = wb.addWorksheet(sheetName(loc.name, used));
      ws.columns = COLUMNS;
      styleHeader(ws);
      if (loc.address) ws.headerFooter.oddHeader = `&L${loc.name}&R${loc.address}`;

      for (const t of loc.tools) {
        const row = ws.addRow({
          code: t.code,
          category: t.category.name,
          brand: t.brand,
          model: t.model ?? "",
          serial: t.serial ?? "",
          status: TOOL_STATUS_LABEL[t.status],
          custodian: t.currentCustodian?.name ?? "",
          price: Number(t.purchasePrice),
          purchaseDate: t.purchaseDate,
          supplier: t.supplier ?? "",
        });
        row.alignment = { vertical: "middle" };
        paintRow(row, COLUMNS.length, STATUS_TONE[t.status], STATUS_COL);
        await this.placePhoto(wb, ws, row, PHOTO_COL, photoKeys.get(t.id));
      }
      gridTable(ws, 1, ws.rowCount, COLUMNS.length, { filter: true });
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Registra cada imagen una sola vez en el libro aunque aparezca en varias hojas. */
  private imageId(wb: ExcelJS.Workbook, key: string): Promise<number | null> {
    let id = this.images.get(key);
    if (!id) {
      id = this.storage
        ? this.storage
            .get(key)
            .then((buffer) => wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "jpeg" }))
            .catch(() => null)
        : Promise.resolve(null);
      this.images.set(key, id);
    }
    return id;
  }

  private async placePhoto(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, row: ExcelJS.Row, col: number, key?: string) {
    if (!key || !this.storage) return;
    const imageId = await this.imageId(wb, key);
    if (imageId == null) {
      row.getCell(col + 1).value = "(no disponible)";
      return;
    }
    row.height = ROW_PT;
    ws.addImage(imageId, {
      tl: { col: col + 0.05, row: row.number - 1 + 0.05 },
      ext: { width: PHOTO_PX, height: PHOTO_PX },
      editAs: "oneCell",
    });
  }

  /** Hasta 3 miniaturas lado a lado en una celda; si hay más, se indica cuántas faltan. */
  private async placeMiniPhotos(
    wb: ExcelJS.Workbook,
    ws: ExcelJS.Worksheet,
    row: ExcelJS.Row,
    col: number,
    photos: { storageKey: string; thumbKey: string | null; hiddenAt: Date | null }[],
  ): Promise<number> {
    if (!photos.length || !this.storage) return 0;
    const colPx = PHOTOS_COL_WIDTH * 7 + 5; // ancho aproximado de la columna en píxeles
    let placed = 0;
    for (const p of photos.slice(0, PHOTOS_PER_CELL)) {
      const imageId = await this.imageId(wb, p.thumbKey ?? p.storageKey);
      if (imageId == null) continue;
      ws.addImage(imageId, {
        tl: { col: col + (4 + placed * (MINI_PX + 4)) / colPx, row: row.number - 1 + 0.04 },
        ext: { width: MINI_PX, height: MINI_PX },
        editAs: "oneCell",
      });
      placed++;
    }
    const notes: string[] = [];
    if (photos.length > PHOTOS_PER_CELL) notes.push(`${photos.length} fotos; se muestran ${PHOTOS_PER_CELL}.`);
    const hidden = photos.filter((p) => p.hiddenAt).length;
    if (hidden) notes.push(`${hidden} eliminada(s) de la app; se conservan aquí como historial.`);
    if (notes.length) row.getCell(col + 1).note = notes.join("\n");
    return placed;
  }

  /**
   * Miniatura de cada herramienta: su foto propia si tiene; si no, la más reciente
   * de un evento suyo o de un traslado que la incluyó.
   */
  private async toolPhotoKeys(tools: { id: string; coverPhotoId: string | null }[]): Promise<Map<string, string>> {
    const keys = new Map<string, string>();
    if (tools.length === 0) return keys;

    const coverIds = tools.flatMap((t) => (t.coverPhotoId ? [t.coverPhotoId] : []));
    const covers = await this.prisma.photo.findMany({
      where: { id: { in: coverIds } },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    const coverById = new Map(covers.map((c) => [c.id, c.thumbKey ?? c.storageKey]));
    for (const t of tools) {
      const key = t.coverPhotoId ? coverById.get(t.coverPhotoId) : undefined;
      if (key) keys.set(t.id, key);
    }

    const pending = tools.map((t) => t.id).filter((id) => !keys.has(id));
    if (pending.length === 0) return keys;
    const photos = await this.prisma.photo.findMany({
      where: {
        hiddenAt: null, // la miniatura de la herramienta sale de las fotos que siguen en la app
        OR: [
          { toolId: { in: pending } },
          { lifecycleEvent: { toolId: { in: pending } } },
          { transfer: { items: { some: { toolId: { in: pending } } } } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: {
        storageKey: true,
        thumbKey: true,
        toolId: true,
        lifecycleEvent: { select: { toolId: true } },
        transfer: { select: { items: { select: { toolId: true } } } },
      },
    });
    const wanted = new Set(pending);
    for (const p of photos) {
      const owners = [p.toolId, p.lifecycleEvent?.toolId, ...(p.transfer?.items.map((i) => i.toolId) ?? [])];
      for (const id of owners) {
        if (id && wanted.has(id) && !keys.has(id)) keys.set(id, p.thumbKey ?? p.storageKey);
      }
    }
    return keys;
  }
}
