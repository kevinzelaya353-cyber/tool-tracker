import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTool, prisma, resetDb, seedBase, transferBody, type Base } from "./helpers.js";

/**
 * Tablero interactivo y separación de valores. Escenario (todo en 2025, zona UTC):
 *   Taladro:  T1 100.00 (ene) → daño en feb con reparación 20.00 → SIGUE dañada
 *             T2 250.00 (ene) → mantenimiento en mar (40.00) → vuelve a bodega
 *   Pulidora: P1 400.00 (feb) → extraviada en mar
 *             P2  80.00 (abr) → trasladada a la obra A
 *   Rentada:  R1 (precio 0) recibida en abr → no es una compra
 */
describe("tablero: detalle de cada cifra y valores separados (integración)", () => {
  let base: Base;
  let pulidoraId: string;
  const ids: Record<string, string> = {};

  const get = (path: string) => as(base.admin).get(path).then((r) => {
    expect(r.status, `${path} → ${JSON.stringify(r.body)}`).toBe(200);
    return r.body;
  });
  const detail = (q: Record<string, string>) => get(`/api/reports/details?${new URLSearchParams({ pageSize: "200", ...q })}`);

  beforeAll(async () => {
    await resetDb();
    base = await seedBase();
    pulidoraId = (await prisma.toolCategory.create({ data: { organizationId: base.org.id, name: "Pulidora" } })).id;
    const ev = (body: Record<string, unknown>) => as(base.bodeguero).post("/api/lifecycle-events", body);

    ids.T1 = (await createTool(base, { purchasePrice: "100.00", purchaseDate: "2025-01-05" })).id;
    ids.T2 = (await createTool(base, { purchasePrice: "250.00", purchaseDate: "2025-01-20" })).id;
    ids.P1 = (await createTool(base, { purchasePrice: "400.00", purchaseDate: "2025-02-10", categoryId: pulidoraId })).id;
    ids.P2 = (await createTool(base, { purchasePrice: "80.00", purchaseDate: "2025-04-01", categoryId: pulidoraId })).id;

    await ev({ toolId: ids.T1, type: "DAMAGE", occurredAt: "2025-02-10T12:00:00Z", cost: "20.00" });
    await ev({ toolId: ids.T2, type: "MAINTENANCE_START", occurredAt: "2025-03-01T12:00:00Z", cost: "40.00" });
    await ev({ toolId: ids.T2, type: "MAINTENANCE_END", occurredAt: "2025-03-10T12:00:00Z", locationId: base.bodega.id });
    await ev({ toolId: ids.P1, type: "LOSS", occurredAt: "2025-03-15T12:00:00Z" });
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [ids.P2], { movedAt: "2025-04-02T08:00:00Z" }));
    const rental = await as(base.bodeguero).post("/api/rentals", {
      id: randomUUID(),
      lessor: "Rentas del Norte",
      locationId: base.bodega.id,
      receivedAt: "2025-04-05T10:00:00Z",
      receptionCondition: "BUENO",
      photoIds: [],
      tool: { code: "REN-0001", categoryId: base.category.id, brand: "Hilti" },
    });
    expect(rental.status).toBe(201);
  });

  afterAll(() => prisma.$disconnect());

  it("12. compradas y dañadas son indicadores separados que no se suman entre sí", async () => {
    const s = await get("/api/reports/summary");
    // Compras: solo herramientas propias (la rentada no es una compra).
    expect(s.purchases).toEqual({ count: 4, value: "830.00" });
    // Dañadas HOY, a valor de adquisición (T1 también es una compra: está en ambos indicadores).
    expect(s.damaged).toEqual({ count: 1, value: "100.00" });
    expect(s.lost).toEqual({ count: 1, value: "400.00" });
    expect(Number(s.inventoryValue)).toBe(330);
    expect(Number(s.maintenanceTotal)).toBe(60);
    // Sin duplicar: lo comprado = lo que sigue en uso + lo dañado + lo extraviado/de baja.
    expect(Number(s.purchaseTotal)).toBe(Number(s.inventoryValue) + Number(s.damaged.value) + Number(s.lost.value));
  });

  it("10-11. cada estado y cada ubicación del tablero abre exactamente sus herramientas", async () => {
    const s = await get("/api/reports/summary");
    for (const [status, { count, value }] of Object.entries(s.byStatus as Record<string, { count: number; value: string }>)) {
      const d = await detail({ metric: "tools", status });
      expect([status, d.count, Number(d.totalValue)]).toEqual([status, count, Number(value)]);
      expect(d.rows).toHaveLength(count);
    }
    const damaged = await detail({ metric: "tools", status: "DANADA" });
    expect(damaged.rows.map((r: { toolId: string }) => r.toolId)).toEqual([ids.T1]);
    expect(damaged.totalValue).toBe(s.damaged.value);

    for (const loc of s.byLocation as { locationId: string; count: number }[]) {
      expect((await detail({ metric: "tools", locationId: loc.locationId })).count).toBe(loc.count);
    }
    const inventory = await detail({ metric: "inventory" });
    expect(inventory.totalValue).toBe(s.inventoryValue);
  });

  it("10-11. cada barra de la serie (compras, mantenimiento, pérdidas) abre los registros que la suman", async () => {
    for (const granularity of ["month", "year"] as const) {
      const series = await get(`/api/reports/spend-over-time?from=2025-01-01&to=2025-06-30&granularity=${granularity}`);
      for (const bar of series as { period: string; purchases: string; maintenance: string; losses: string }[]) {
        for (const metric of ["purchases", "maintenance", "losses"] as const) {
          const d = await detail({ metric, period: bar.period, granularity });
          expect([bar.period, metric, Number(d.totalValue)]).toEqual([bar.period, metric, Number(bar[metric])]);
        }
      }
    }
    const feb = await detail({ metric: "purchases", period: "2025-02-01" });
    expect(feb.rows.map((r: { toolId: string; value: string }) => [r.toolId, r.value])).toEqual([[ids.P1, "400.00"]]);
    const mar = await detail({ metric: "maintenance", period: "2025-03-01" });
    expect(mar.rows).toEqual([expect.objectContaining({ toolId: ids.T2, value: "40.00", eventType: "MAINTENANCE_START" })]);
  });

  it("10-11. cada categoría del gráfico abre sus compras, gastos y pérdidas del periodo", async () => {
    const range = { from: "2025-01-01T00:00:00Z", to: "2025-12-31T23:59:59Z" };
    const rows = await get(`/api/reports/spend-by-category?from=${range.from}&to=${range.to}`);
    for (const c of rows as { categoryId: string; purchasedCount: number; purchaseTotal: string; maintenanceTotal: string; lossCount: number; lossTotal: string }[]) {
      const p = await detail({ metric: "purchases", categoryId: c.categoryId, ...range });
      expect([c.categoryId, p.count, Number(p.totalValue)]).toEqual([c.categoryId, c.purchasedCount, Number(c.purchaseTotal)]);
      const m = await detail({ metric: "maintenance", categoryId: c.categoryId, ...range });
      expect(Number(m.totalValue)).toBe(Number(c.maintenanceTotal));
      const l = await detail({ metric: "losses", categoryId: c.categoryId, ...range });
      expect([l.count, Number(l.totalValue)]).toEqual([c.lossCount, Number(c.lossTotal)]);
    }
    // La rentada no cuenta como comprada en su categoría.
    const taladro = rows.find((r: { categoryId: string }) => r.categoryId === base.category.id);
    expect(taladro.purchasedCount).toBe(2);
  });

  it("1.4 los filtros del tablero (categoría, ubicación, periodo) se aplican igual al total y al detalle", async () => {
    const byCat = await get(`/api/reports/summary?categoryId=${pulidoraId}`);
    expect(byCat.purchases).toEqual({ count: 2, value: "480.00" });
    expect(byCat.lost).toEqual({ count: 1, value: "400.00" });
    expect(byCat.damaged.count).toBe(0);
    const d = await detail({ metric: "purchases", categoryId: pulidoraId });
    expect([d.count, d.totalValue]).toEqual([2, "480.00"]);

    const atObra = await get(`/api/reports/summary?locationId=${base.obraA.id}`);
    expect(atObra.byStatus.EN_PROYECTO.count).toBe(1);
    expect((await detail({ metric: "tools", locationId: base.obraA.id })).rows.map((r: { toolId: string }) => r.toolId)).toEqual([ids.P2]);

    const q1 = await get("/api/reports/summary?from=2025-01-01T00:00:00Z&to=2025-03-31T23:59:59Z");
    expect(q1.purchases).toEqual({ count: 3, value: "750.00" });
    expect(Number(q1.maintenanceTotal)).toBe(60);
    const dq1 = await detail({ metric: "purchases", from: "2025-01-01T00:00:00Z", to: "2025-03-31T23:59:59Z" });
    expect([dq1.count, dq1.totalValue]).toEqual([3, "750.00"]);
  });

  it("el detalle se pagina y se busca sin cambiar el total de la cifra", async () => {
    const page1 = await detail({ metric: "purchases", pageSize: "2", page: "1" });
    const page2 = await detail({ metric: "purchases", pageSize: "2", page: "2" });
    expect(page1.count).toBe(4);
    expect([...page1.rows, ...page2.rows].map((r: { toolId: string }) => r.toolId).sort()).toEqual(
      [ids.T1, ids.T2, ids.P1, ids.P2].sort(),
    );
    const code = (await prisma.tool.findUniqueOrThrow({ where: { id: ids.P1 } })).code;
    const search = await detail({ metric: "purchases", q: code });
    expect(search.rows.map((r: { toolId: string }) => r.toolId)).toEqual([ids.P1]);
    // Comodines de LIKE se tratan como texto.
    expect((await detail({ metric: "purchases", q: "%" })).count).toBe(0);
  });

  it("13. el listado de herramientas muestra el valor solo a quien puede verlo", async () => {
    const admin = await as(base.admin).get("/api/tools?pageSize=100");
    const t1 = admin.body.data.find((t: { id: string }) => t.id === ids.T1);
    expect(t1.purchasePrice).toBe("100");
    for (const who of [base.bodeguero, base.supervisor, base.lector]) {
      const res = await as(who).get("/api/tools?pageSize=100");
      expect(res.body.data.every((t: object) => !("purchasePrice" in t))).toBe(true);
      const history = await as(who).get(`/api/tools/${ids.T1}/history`);
      expect(history.body.every((e: object) => !("cost" in e))).toBe(true);
    }
    const adminHistory = await as(base.admin).get(`/api/tools/${ids.T1}/history`);
    expect(adminHistory.body.find((e: { type: string }) => e.type === "PURCHASE").cost).toBe("100");
  });
});
