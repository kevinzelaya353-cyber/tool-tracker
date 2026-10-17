import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTool, prisma, resetDb, seedBase, transferBody, type Base } from "./helpers.js";

/**
 * Escenario con montos conocidos (todo en 2025, zona UTC):
 *   Taladro:  T1 100.00 (ene)  → se pierde en mar
 *             T2 250.00 (ene)  → daño en feb (reparación 30.00) → mantenimiento → vuelve sana (NO es pérdida)
 *   Pulidora: P1 400.00 (feb)  → daño en abr → dada de baja en may (pérdida fechada en abr)
 *             P2  80.00 (abr)  → sigue en obra
 */
describe("reportes financieros (integración)", () => {
  let base: Base;
  let pulidoraId: string;

  beforeAll(async () => {
    await resetDb();
    base = await seedBase();
    pulidoraId = (await prisma.toolCategory.create({ data: { name: "Pulidora" } })).id;

    const ev = (body: Record<string, unknown>, user = base.bodeguero) => as(user).post("/api/lifecycle-events", body);

    const t1 = await createTool(base, { purchasePrice: "100.00", purchaseDate: "2025-01-05" });
    const t2 = await createTool(base, { purchasePrice: "250.00", purchaseDate: "2025-01-20" });
    const p1 = await createTool(base, { purchasePrice: "400.00", purchaseDate: "2025-02-10", categoryId: pulidoraId });
    const p2 = await createTool(base, { purchasePrice: "80.00", purchaseDate: "2025-04-01", categoryId: pulidoraId });

    await ev({ toolId: t1.id, type: "LOSS", occurredAt: "2025-03-15T12:00:00Z" });

    await ev({ toolId: t2.id, type: "DAMAGE", occurredAt: "2025-02-12T12:00:00Z", cost: "30.00" });
    await ev({ toolId: t2.id, type: "MAINTENANCE_START", occurredAt: "2025-02-13T12:00:00Z" });
    await ev({ toolId: t2.id, type: "MAINTENANCE_END", occurredAt: "2025-02-20T12:00:00Z", locationId: base.bodega.id });

    await ev({ toolId: p1.id, type: "DAMAGE", occurredAt: "2025-04-10T12:00:00Z" });
    await ev({ toolId: p1.id, type: "DECOMMISSION", occurredAt: "2025-05-02T12:00:00Z" }, base.admin);

    await as(base.bodeguero).post("/api/transfers", transferBody(base, [p2.id], { movedAt: "2025-04-02T08:00:00Z" }));
  });

  afterAll(() => prisma.$disconnect());

  it("resumen: inventario vigente, pérdidas, compras y mantenimiento", async () => {
    const res = await as(base.lector).get("/api/reports/summary");
    expect(res.status).toBe(200);
    expect(Number(res.body.purchaseTotal)).toBe(830);
    expect(Number(res.body.inventoryValue)).toBe(330); // T2 250 + P2 80
    expect(Number(res.body.lossValue)).toBe(500); // T1 100 + P1 400
    expect(Number(res.body.maintenanceTotal)).toBe(30);
    expect(res.body.byStatus).toMatchObject({
      BODEGA: { count: 1 },
      EN_PROYECTO: { count: 1 },
      EXTRAVIADA: { count: 1 },
      DADA_DE_BAJA: { count: 1 },
      DANADA: { count: 0 },
    });
  });

  it("gasto por tipo de herramienta", async () => {
    const res = await as(base.lector).get("/api/reports/spend-by-category");
    const byName = Object.fromEntries(res.body.map((r: { category: string }) => [r.category, r]));
    expect(byName.Taladro).toMatchObject({ purchasedCount: 2, lossCount: 1 });
    expect(Number(byName.Taladro.purchaseTotal)).toBe(350);
    expect(Number(byName.Taladro.maintenanceTotal)).toBe(30);
    expect(Number(byName.Taladro.lossTotal)).toBe(100);
    expect(Number(byName.Pulidora.purchaseTotal)).toBe(480);
    expect(Number(byName.Pulidora.lossTotal)).toBe(400);
    expect(res.body[0].category).toBe("Pulidora"); // ordenado por gasto
  });

  it("gasto por tipo filtrado por periodo", async () => {
    const res = await as(base.lector).get("/api/reports/spend-by-category?from=2025-02-01&to=2025-02-28T23:59:59Z");
    const byName = Object.fromEntries(res.body.map((r: { category: string }) => [r.category, r]));
    expect(Number(byName.Pulidora.purchaseTotal)).toBe(400);
    expect(Number(byName.Taladro.purchaseTotal)).toBe(0);
    expect(Number(byName.Taladro.maintenanceTotal)).toBe(30);
  });

  it("serie mensual con meses vacíos en cero", async () => {
    const res = await as(base.lector).get("/api/reports/spend-over-time?from=2025-01-01&to=2025-06-30&granularity=month");
    expect(res.status).toBe(200);
    const rows = res.body.map((r: { period: string; purchases: string; maintenance: string; losses: string }) => [
      r.period,
      Number(r.purchases),
      Number(r.maintenance),
      Number(r.losses),
    ]);
    expect(rows).toEqual([
      ["2025-01-01", 350, 0, 0],
      ["2025-02-01", 400, 30, 0],
      ["2025-03-01", 0, 0, 100],
      ["2025-04-01", 80, 0, 400], // pérdida de P1 fechada en el daño, no en la baja
      ["2025-05-01", 0, 0, 0],
      ["2025-06-01", 0, 0, 0],
    ]);
  });

  it("serie anual", async () => {
    const res = await as(base.lector).get("/api/reports/spend-over-time?from=2024-01-01&to=2025-12-31&granularity=year");
    expect(res.body.map((r: { period: string; purchases: string }) => [r.period, Number(r.purchases)])).toEqual([
      ["2024-01-01", 0],
      ["2025-01-01", 830],
    ]);
  });

  it("control de pérdidas: totales por estado y detalle (lo reparado no cuenta)", async () => {
    const res = await as(base.lector).get("/api/reports/losses");
    expect(Number(res.body.totalValue)).toBe(500);
    expect(res.body.totals.EXTRAVIADA).toMatchObject({ count: 1 });
    expect(res.body.totals.DADA_DE_BAJA).toMatchObject({ count: 1 });
    expect(res.body.totals.DANADA).toMatchObject({ count: 0 });
    expect(res.body.rows.map((r: { purchasePrice: string }) => Number(r.purchasePrice)).sort()).toEqual([100, 400]);
  });

  it("valida el rango de la serie", async () => {
    expect((await as(base.lector).get("/api/reports/spend-over-time?from=2000-01-01&to=2025-01-01")).status).toBe(400);
    expect((await as(base.lector).get("/api/reports/spend-over-time")).status).toBe(200); // por defecto 12 meses
  });

  it("requiere autenticación", async () => {
    expect((await as(null).get("/api/reports/summary")).status).toBe(401);
    expect((await as(null).get("/api/reports/export/inventory.xlsx")).status).toBe(401);
  });

  it("exporta a Excel: resumen y una pestaña por ubicación con sus herramientas", async () => {
    const res = await as(base.lector)
      .get("/api/reports/export/inventory.xlsx")
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const names = wb.worksheets.map((w) => w.name);
    expect(names[0]).toBe("Resumen");
    expect(names).toEqual(expect.arrayContaining([base.bodega.name, base.obraA.name, base.obraB.name]));

    // P2 (80.00) quedó en la obra A tras el traslado.
    const obra = wb.getWorksheet(base.obraA.name)!;
    expect(obra.getRow(1).getCell(1).value).toBe("Código");
    expect(obra.rowCount).toBe(2);
    expect(obra.getRow(2).getCell(8).value).toBe(80);
  });
});
