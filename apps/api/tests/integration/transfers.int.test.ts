import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  as,
  createTool,
  fakePhoto,
  prisma,
  resetDb,
  seedBase,
  toolEvents,
  toolState,
  transferBody,
  type Base,
} from "./helpers.js";

describe("traslados (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it("bodega → obra con varias herramientas y fotos: estado, ubicación, custodio, eventos y evidencia", async () => {
    const [t1, t2] = [await createTool(base), await createTool(base)];
    const [p1, p2] = [await fakePhoto(base.bodeguero), await fakePhoto(base.bodeguero)];

    const res = await as(base.bodeguero).post(
      "/api/transfers",
      transferBody(base, [t1.id, t2.id], { photoIds: [p1.id, p2.id], notes: "Entrega lunes" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.photos).toHaveLength(2);

    for (const t of [t1, t2]) {
      expect(await toolState(t.id)).toEqual({
        status: "EN_PROYECTO",
        currentLocationId: base.obraA.id,
        currentCustodianId: base.receptor.id,
      });
      const events = await toolEvents(t.id);
      expect(events.at(-1)).toMatchObject({
        type: "TRANSFER",
        fromStatus: "BODEGA",
        toStatus: "EN_PROYECTO",
        transferId: res.body.id,
        locationId: base.obraA.id,
      });
    }
    expect(await prisma.photo.count({ where: { transferId: res.body.id } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: "transfer.create" } })).toBe(1);
  });

  it("obra → obra y regreso a bodega (el custodio se libera en bodega)", async () => {
    const t = await createTool(base);
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
    const toB = await as(base.supervisor).post(
      "/api/transfers",
      transferBody(base, [t.id], {
        fromLocationId: base.obraA.id,
        toLocationId: base.obraB.id,
        deliveredById: base.receptor.id,
        receivedById: base.supervisor.id,
        movedAt: "2025-02-05T08:00:00Z",
      }),
    );
    expect(toB.status).toBe(201);
    const back = await as(base.bodeguero).post(
      "/api/transfers",
      transferBody(base, [t.id], {
        fromLocationId: base.obraB.id,
        toLocationId: base.bodega.id,
        deliveredById: base.supervisor.id,
        receivedById: base.bodeguero.id,
        movedAt: "2025-02-10T08:00:00Z",
      }),
    );
    expect(back.status).toBe(201);
    expect(await toolState(t.id)).toEqual({ status: "BODEGA", currentLocationId: base.bodega.id, currentCustodianId: null });
    expect((await toolEvents(t.id)).map((e) => e.type)).toEqual(["PURCHASE", "TRANSFER", "TRANSFER", "TRANSFER"]);
  });

  it("no se envía a proyecto una herramienta extraviada, y el traslado es atómico", async () => {
    const ok = await createTool(base);
    const lost = await createTool(base);
    await as(base.bodeguero).post("/api/lifecycle-events", { toolId: lost.id, type: "LOSS", occurredAt: "2025-01-20T00:00:00Z" });

    const res = await as(base.bodeguero).post("/api/transfers", transferBody(base, [ok.id, lost.id]));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TRANSFER_REJECTED");
    expect(res.body.error.details).toEqual([expect.objectContaining({ toolId: lost.id, code: "INVALID_TRANSITION" })]);

    // Nada se movió: ni la herramienta válida.
    expect((await toolState(ok.id)).status).toBe("BODEGA");
    expect(await prisma.transfer.count()).toBe(0);
    expect(await prisma.lifecycleEvent.count({ where: { type: "TRANSFER" } })).toBe(0);
  });

  it("rechaza herramientas que no están en el origen declarado", async () => {
    const t = await createTool(base);
    const res = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { fromLocationId: base.obraB.id }));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].code).toBe("NOT_AT_ORIGIN");
  });

  it("rechaza fechas anteriores al último movimiento (cronología de la cadena de custodia)", async () => {
    const t = await createTool(base);
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { movedAt: "2025-03-01T08:00:00Z" }));
    const res = await as(base.bodeguero).post(
      "/api/transfers",
      transferBody(base, [t.id], { fromLocationId: base.obraA.id, toLocationId: base.bodega.id, movedAt: "2025-02-15T08:00:00Z" }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].code).toBe("OUT_OF_ORDER");
  });

  it("validaciones de entrada: misma persona, mismo origen/destino, sin herramientas, fecha futura", async () => {
    const t = await createTool(base);
    const cases = [
      { receivedById: base.bodeguero.id },
      { toLocationId: base.bodega.id },
      { items: [] },
      { movedAt: new Date(Date.now() + 86_400_000).toISOString() },
    ];
    for (const c of cases) {
      const res = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], c));
      expect(res.status, JSON.stringify(c)).toBe(400);
    }
  });

  it("rechaza destino cerrado, receptor inactivo y vehículo inexistente", async () => {
    const t = await createTool(base);
    await prisma.location.update({ where: { id: base.obraB.id }, data: { active: false } });
    const inactive = await prisma.user.update({ where: { id: base.lector.id }, data: { active: false } });

    const closed = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { toLocationId: base.obraB.id }));
    expect(closed.body.error.code).toBe("INVALID_LOCATION");
    const person = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { receivedById: inactive.id }));
    expect(person.body.error.code).toBe("INVALID_PERSON");
    const vehicle = await as(base.bodeguero).post(
      "/api/transfers",
      transferBody(base, [t.id], { vehicleId: "00000000-0000-4000-8000-000000000000" }),
    );
    expect(vehicle.body.error.code).toBe("INVALID_VEHICLE");
  });

  it("no se pueden adjuntar fotos de otro usuario; el traslado completo se revierte", async () => {
    const t = await createTool(base);
    const foreign = await fakePhoto(base.supervisor);
    const res = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { photoIds: [foreign.id] }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PHOTO_UNAVAILABLE");
    expect((await toolState(t.id)).status).toBe("BODEGA");
    expect(await prisma.transfer.count()).toBe(0);
  });

  it("una foto ya usada como evidencia no se puede reutilizar", async () => {
    const [t1, t2] = [await createTool(base), await createTool(base)];
    const p = await fakePhoto(base.bodeguero);
    expect((await as(base.bodeguero).post("/api/transfers", transferBody(base, [t1.id], { photoIds: [p.id] }))).status).toBe(201);
    const res = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t2.id], { photoIds: [p.id] }));
    expect(res.body.error.code).toBe("PHOTO_UNAVAILABLE");
  });

  it("SUPERVISOR registra traslados; LECTOR no", async () => {
    const t = await createTool(base);
    expect((await as(base.lector).post("/api/transfers", transferBody(base, [t.id]))).status).toBe(403);
    expect((await as(base.supervisor).post("/api/transfers", transferBody(base, [t.id]))).status).toBe(201);
  });

  it("CONCURRENCIA: dos traslados simultáneos de la misma herramienta → exactamente uno gana", async () => {
    const t = await createTool(base);
    const [a, b] = await Promise.all([
      as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { toLocationId: base.obraA.id })),
      as(base.supervisor).post("/api/transfers", transferBody(base, [t.id], { toLocationId: base.obraB.id })),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = a.status === 201 ? base.obraA.id : base.obraB.id;
    expect((await toolState(t.id)).currentLocationId).toBe(winner);
    expect(await prisma.lifecycleEvent.count({ where: { toolId: t.id, type: "TRANSFER" } })).toBe(1);
  });

  it("CONCURRENCIA: 10 traslados en paralelo de herramientas distintas no se bloquean entre sí", async () => {
    const tools = [];
    for (let i = 0; i < 10; i++) tools.push(await createTool(base));
    const results = await Promise.all(tools.map((t) => as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]))));
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await prisma.tool.count({ where: { status: "EN_PROYECTO" } })).toBe(10);
  });

  it("listado filtrado por herramienta y detalle", async () => {
    const t = await createTool(base);
    const created = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
    const list = await as(base.lector).get(`/api/transfers?toolId=${t.id}`);
    expect(list.body.total).toBe(1);
    const detail = await as(base.lector).get(`/api/transfers/${created.body.id}`);
    expect(detail.body.items[0].tool.id).toBe(t.id);
  });
});
