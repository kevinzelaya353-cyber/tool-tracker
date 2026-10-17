import type { PhotoStage, Prisma, PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { TOOL_STATUS_LABEL, type EventType } from "@tt/shared";
import type { ObjectStorage } from "../media/storage.js";

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

const EVENT_LABEL: Record<EventType, string> = {
  PURCHASE: "Alta (compra)",
  TRANSFER: "Traslado",
  MAINTENANCE_START: "Enviada a mantenimiento",
  MAINTENANCE_END: "Mantenimiento finalizado",
  DAMAGE: "Reporte de daño",
  LOSS: "Reporte de extravío",
  RECOVERY: "Recuperada",
  DECOMMISSION: "Dada de baja",
};

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
const PHOTO_COL = COLUMNS.length - 1; // índice 0-based de la columna "Foto"

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

function styleHeader(ws: ExcelJS.Worksheet, row = 1) {
  const header = ws.getRow(row);
  header.font = { bold: true, color: { argb: "FF1F1300" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: row }];
}

const link = (url: string | null, text: string): ExcelJS.CellValue => (url ? { text, hyperlink: url } : "");
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
  notes: true,
  routeDistanceM: true,
  routeDurationS: true,
  fromLocation: { select: { name: true, latitude: true, longitude: true } },
  toLocation: { select: { name: true, latitude: true, longitude: true } },
  deliveredBy: { select: { name: true } },
  receivedBy: { select: { name: true } },
  vehicle: { select: { plate: true } },
  photos: { select: { storageKey: true, thumbKey: true, stage: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TransferSelect;

/**
 * Libro de Excel del inventario:
 * - Resumen por ubicación (con enlace al mapa).
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
              photos: { select: { storageKey: true, thumbKey: true }, orderBy: { createdAt: "asc" } },
              transfer: { select: TRANSFER_SELECT },
            },
          },
        },
      }),
      this.prisma.transfer.findMany({
        orderBy: { movedAt: "desc" },
        select: { ...TRANSFER_SELECT, items: { select: { tool: { select: { code: true } } } } },
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
      total.font = { bold: true };
    }

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
        lastMove: last?.occurredAt ?? null,
      });
      row.alignment = { vertical: "middle" };
      await this.placePhoto(wb, all, row, allPhotoCol, photoKeys.get(t.id));
    }

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
                date: tr.movedAt,
                kind: EVENT_LABEL.TRANSFER,
                from: tr.fromLocation.name,
                to: tr.toLocation.name,
                delivered: tr.deliveredBy.name,
                received: tr.receivedBy.name,
                vehicle: tr.vehicle?.plate ?? "",
                km: km(tr.routeDistanceM),
                route: link(routeUrl(tr.fromLocation, tr.toLocation), "Ver ruta"),
                notes: tr.notes ?? "",
              }
            : {
                date: e.occurredAt,
                kind: EVENT_LABEL[e.type],
                to: e.location?.name ?? "",
                delivered: e.reportedBy.name,
                notes: e.description ?? "",
              },
        );
        row.alignment = { vertical: "middle", wrapText: true };
        // Fotos sin etapa (traslados anteriores o eventos) se muestran como de entrega/evidencia.
        const photos = tr ? tr.photos : e.photos.map((p) => ({ ...p, stage: null as PhotoStage | null }));
        const delivery = photos.filter((p) => p.stage !== "RECEPCION");
        const reception = photos.filter((p) => p.stage === "RECEPCION");
        const placed =
          (await this.placeMiniPhotos(wb, hist, row, 10, delivery)) +
          (await this.placeMiniPhotos(wb, hist, row, 11, reception));
        if (placed) row.height = MINI_ROW_PT;
      }
      hist.addRow([]);
    }

    // ---------- Traslados ----------
    const tws = wb.addWorksheet(sheetName("Traslados", used));
    tws.columns = [
      { header: "Fecha", key: "date", width: 17, style: { numFmt: DATETIME_FMT } },
      { header: "Desde", key: "from", width: 24 },
      { header: "Hacia", key: "to", width: 24 },
      { header: "Herramientas", key: "tools", width: 28 },
      { header: "Entregó", key: "delivered", width: 20 },
      { header: "Recibió", key: "received", width: 20 },
      { header: "Vehículo", key: "vehicle", width: 11 },
      { header: "Distancia (km)", key: "km", width: 13, style: { numFmt: "0.0" } },
      { header: "Duración aprox.", key: "duration", width: 14 },
      { header: "Ruta", key: "route", width: 12 },
      { header: "Fotos", key: "photos", width: 8 },
      { header: "Notas", key: "notes", width: 30 },
    ];
    styleHeader(tws);
    for (const tr of transfers) {
      tws.addRow({
        date: tr.movedAt,
        from: tr.fromLocation.name,
        to: tr.toLocation.name,
        tools: tr.items.map((i) => i.tool.code).join(", "),
        delivered: tr.deliveredBy.name,
        received: tr.receivedBy.name,
        vehicle: tr.vehicle?.plate ?? "",
        km: km(tr.routeDistanceM),
        duration: duration(tr.routeDurationS),
        route: link(routeUrl(tr.fromLocation, tr.toLocation), "Ver ruta"),
        photos: tr.photos.length,
        notes: tr.notes ?? "",
      }).alignment = { vertical: "top", wrapText: true };
    }
    if (transfers.length) tws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: tws.columns.length } };

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
        await this.placePhoto(wb, ws, row, PHOTO_COL, photoKeys.get(t.id));
      }
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
    photos: { storageKey: string; thumbKey: string | null }[],
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
    if (photos.length > PHOTOS_PER_CELL) row.getCell(col + 1).note = `${photos.length} fotos; se muestran ${PHOTOS_PER_CELL}.`;
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
