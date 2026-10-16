import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, createTool, prisma, resetDb, seedBase, toolEvents, toolState, type Base } from "./helpers.js";

describe("herramientas (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it("el alta deja la herramienta en bodega con evento PURCHASE y auditoría", async () => {
    const tool = await createTool(base, { purchasePrice: "1499.99" });
    expect(await toolState(tool.id)).toMatchObject({ status: "BODEGA", currentLocationId: base.bodega.id });
    const events = await toolEvents(tool.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "PURCHASE", fromStatus: null, toStatus: "BODEGA" });
    expect(events[0]!.cost?.toString()).toBe("1499.99");
    expect(await prisma.auditLog.count({ where: { action: "tool.create", entityId: tool.id } })).toBe(1);
  });

  it("no se puede dar de alta directamente en un proyecto", async () => {
    const res = await as(base.bodeguero).post("/api/tools", {
      code: "TAL-X1",
      categoryId: base.category.id,
      brand: "Bosch",
      purchasePrice: "50",
      purchaseDate: "2025-01-01",
      initialLocationId: base.obraA.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_LOCATION");
  });

  it("código duplicado → 409", async () => {
    await createTool(base, { code: "DUP-001" });
    await expect(createTool(base, { code: "DUP-001" })).rejects.toThrow(/409/);
  });

  it("LECTOR y SUPERVISOR no pueden dar de alta", async () => {
    for (const u of [base.lector, base.supervisor]) {
      const res = await as(u).post("/api/tools", { code: "NOPE-1" });
      expect(res.status).toBe(403);
    }
  });

  it("PATCH ignora campos derivados (status, ubicación): no hay asignación masiva", async () => {
    const tool = await createTool(base);
    const res = await as(base.bodeguero).patch(`/api/tools/${tool.id}`, {
      brand: "DeWalt",
      status: "EXTRAVIADA",
      currentLocationId: base.obraA.id,
    });
    expect(res.status).toBe(200);
    expect(await toolState(tool.id)).toMatchObject({ status: "BODEGA", currentLocationId: base.bodega.id });
  });

  it("solo ADMIN corrige el precio de compra, y queda auditado con valor anterior y nuevo", async () => {
    const tool = await createTool(base, { purchasePrice: "100.00" });
    expect((await as(base.bodeguero).patch(`/api/tools/${tool.id}`, { purchasePrice: "1.00" })).status).toBe(403);

    expect((await as(base.admin).patch(`/api/tools/${tool.id}`, { purchasePrice: "120.50" })).status).toBe(200);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "tool.update", entityId: tool.id } });
    expect(log.diff).toMatchObject({ purchasePrice: { from: "100", to: "120.50" } });
  });

  it("búsqueda, filtro por estado y paginación", async () => {
    for (let i = 0; i < 24; i++) await createTool(base);
    await createTool(base, { code: "BUSCA-01" });
    const page1 = await as(base.lector).get("/api/tools?pageSize=10&status=BODEGA");
    expect(page1.body).toMatchObject({ total: 25, page: 1, pageSize: 10 });
    expect(page1.body.data).toHaveLength(10);
    const search = await as(base.lector).get("/api/tools?q=busca-01");
    expect(search.body.data.map((t: { code: string }) => t.code)).toEqual(["BUSCA-01"]);
  });

  it("buscar por código (QR) y ver historial", async () => {
    const tool = await createTool(base, { code: "QR-777" });
    const byCode = await as(base.supervisor).get("/api/tools/by-code/qr-777");
    expect(byCode.body.id).toBe(tool.id);
    expect(byCode.body.availableEvents).toContain("TRANSFER");
    const history = await as(base.supervisor).get(`/api/tools/${tool.id}/history`);
    expect(history.body).toHaveLength(1);
  });

  it("no se puede cerrar una ubicación con herramientas asignadas", async () => {
    await createTool(base);
    const res = await as(base.bodeguero).patch(`/api/locations/${base.bodega.id}`, { active: false });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LOCATION_NOT_EMPTY");
  });
});
