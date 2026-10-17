import type { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { TOOL_STATUS_LABEL } from "@tt/shared";
import type { ObjectStorage } from "../media/storage.js";

const MONEY_FMT = '"L" #,##0.00';
const DATE_FMT = "dd/mm/yyyy";
const PHOTO_PX = 76;
const ROW_PT = 62; // alto de fila (puntos) para que quepa la miniatura

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

function styleHeader(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FF1F1300" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF59E0B" } };
  header.alignment = { vertical: "middle" };
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

/**
 * Libro de Excel del inventario: una pestaña de resumen y una por ubicación (proyectos primero,
 * luego bodegas) con sus herramientas actuales y la foto más reciente de cada una.
 */
export class ExportService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage?: ObjectStorage,
  ) {}

  async inventoryWorkbook(): Promise<Buffer> {
    const locations = await this.prisma.location.findMany({
      where: { active: true },
      orderBy: [{ type: "desc" }, { name: "asc" }], // PROYECTO antes que BODEGA
      include: {
        tools: {
          orderBy: { code: "asc" },
          include: { category: true, currentCustodian: { select: { name: true } } },
        },
      },
    });

    const toolIds = locations.flatMap((l) => l.tools.map((t) => t.id));
    const photoKeys = await this.latestPhotoKeys(toolIds);

    const wb = new ExcelJS.Workbook();
    wb.creator = "Control de Herramientas";
    wb.created = new Date();
    const used = new Set<string>();

    const summary = wb.addWorksheet(sheetName("Resumen", used));
    summary.columns = [
      { header: "Ubicación", key: "name", width: 30 },
      { header: "Tipo", key: "type", width: 12 },
      { header: "Dirección", key: "address", width: 40 },
      { header: "Herramientas", key: "count", width: 14 },
      { header: "Valor de compra", key: "value", width: 18, style: { numFmt: MONEY_FMT } },
    ];
    styleHeader(summary);

    for (const loc of locations) {
      summary.addRow({
        name: loc.name,
        type: loc.type === "PROYECTO" ? "Proyecto" : "Bodega",
        address: loc.address ?? "",
        count: loc.tools.length,
        value: loc.tools.reduce((s, t) => s + Number(t.purchasePrice), 0),
      });

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

        const key = photoKeys.get(t.id);
        if (!key || !this.storage) continue;
        try {
          const buffer = await this.storage.get(key);
          const imageId = wb.addImage({ buffer: buffer as unknown as ExcelJS.Buffer, extension: "jpeg" });
          row.height = ROW_PT;
          ws.addImage(imageId, {
            tl: { col: PHOTO_COL + 0.05, row: row.number - 1 + 0.05 },
            ext: { width: PHOTO_PX, height: PHOTO_PX },
            editAs: "oneCell",
          });
        } catch {
          row.getCell("photo").value = "(no disponible)";
        }
      }
    }

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Miniatura más reciente de cada herramienta: foto propia, de un evento suyo o de un traslado que la incluyó. */
  private async latestPhotoKeys(toolIds: string[]): Promise<Map<string, string>> {
    const keys = new Map<string, string>();
    if (toolIds.length === 0) return keys;
    const photos = await this.prisma.photo.findMany({
      where: {
        OR: [
          { toolId: { in: toolIds } },
          { lifecycleEvent: { toolId: { in: toolIds } } },
          { transfer: { items: { some: { toolId: { in: toolIds } } } } },
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
    const wanted = new Set(toolIds);
    for (const p of photos) {
      const owners = [p.toolId, p.lifecycleEvent?.toolId, ...(p.transfer?.items.map((i) => i.toolId) ?? [])];
      for (const id of owners) {
        if (id && wanted.has(id) && !keys.has(id)) keys.set(id, p.thumbKey ?? p.storageKey);
      }
    }
    return keys;
  }
}
