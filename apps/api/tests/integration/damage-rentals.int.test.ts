import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, createTool, fakePhoto, prisma, resetDb, seedBase, storage, toolEvents, toolState, type Base, type TestUser } from "./helpers.js";

const jpeg = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#c33" } }).jpeg().toBuffer();

/** Sube fotos reales por /api/media (validación por magic bytes, re-codificación y miniatura). */
async function uploadReal(user: TestUser, n: number): Promise<string[]> {
  let req = as(user).upload("/api/media");
  for (let i = 0; i < n; i++) req = req.attach("photos", await jpeg(), { filename: `f${i}.jpg`, contentType: "image/jpeg" });
  const res = await req;
  expect(res.status).toBe(201);
  return (res.body as { id: string }[]).map((p) => p.id);
}

const photoIds = async (user: TestUser, n: number) => Promise.all(Array.from({ length: n }, () => fakePhoto(user).then((p) => p.id)));

const damageBody = (toolId: string, overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  toolId,
  occurredAt: "2025-03-01T10:00:00Z",
  kind: "GOLPE",
  condition: "CON_DETALLES",
  description: "Carcasa con golpe lateral",
  photoIds: [],
  ...overrides,
});

describe("reportes de daño (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it("registra un daño con una foto real subida por /media y la guarda asociada al reporte", async () => {
    const t = await createTool(base);
    const [photo] = await uploadReal(base.supervisor, 1);
    const res = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { photoIds: [photo], notes: "Sigue funcionando" }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ kind: "GOLPE", condition: "CON_DETALLES", toolStatus: "BODEGA", notes: "Sigue funcionando" });
    expect(res.body.reportedBy).toMatchObject({ id: base.supervisor.id, name: "Supervisor" });
    expect(res.body.photos).toEqual([{ id: photo }]);

    // Persistencia: la foto queda en el almacenamiento y la URL firmada se puede pedir.
    const stored = await prisma.photo.findUniqueOrThrow({ where: { id: photo } });
    expect(stored).toMatchObject({ damageReportId: res.body.id, toolId: t.id });
    expect(storage.objects.has(stored.storageKey)).toBe(true);
    const urls = await as(base.lector).post("/api/media/urls", { ids: [photo], variant: "full" });
    expect(Object.keys(urls.body.urls)).toEqual([photo]);
    // Un detalle menor no cambia el estado.
    expect((await toolState(t.id)).status).toBe("BODEGA");
  });

  it("acepta tres fotos y rechaza una cuarta (sin crear nada)", async () => {
    const t = await createTool(base);
    const three = await photoIds(base.supervisor, 3);
    const ok = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { photoIds: three }));
    expect(ok.status).toBe(201);
    expect(ok.body.photos).toHaveLength(3);

    const four = await photoIds(base.supervisor, 4);
    const body = damageBody(t.id, { photoIds: four });
    const rejected = await as(base.supervisor).post("/api/damage-reports", body);
    expect(rejected.status).toBe(400);
    expect(await prisma.damageReport.count({ where: { id: body.id } })).toBe(0);
    expect(await prisma.photo.count({ where: { id: { in: four }, damageReportId: { not: null } } })).toBe(0);
  });

  it("una foto quitada antes de guardar se borra y ya no puede asociarse", async () => {
    const t = await createTool(base);
    const [keep, removed] = await uploadReal(base.supervisor, 2);
    expect((await as(base.supervisor).del(`/api/media/${removed}`)).status).toBe(204);
    expect(await prisma.photo.count({ where: { id: removed } })).toBe(0);

    const res = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { photoIds: [keep, removed] }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PHOTO_UNAVAILABLE");
    const ok = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { photoIds: [keep] }));
    expect(ok.body.photos).toEqual([{ id: keep }]);
  });

  it("si no funciona la pasa a DANADA; una herramienta ya dañada acumula reportes sin perder los anteriores", async () => {
    const t = await createTool(base);
    const first = await as(base.supervisor).post(
      "/api/damage-reports",
      damageBody(t.id, { condition: "NO_OPERATIVA", kind: "FALLA", photoIds: await photoIds(base.supervisor, 2) }),
    );
    expect(first.status).toBe(201);
    expect(first.body.lifecycleEvent).toMatchObject({ fromStatus: "BODEGA", toStatus: "DANADA" });
    expect((await toolState(t.id)).status).toBe("DANADA");

    const second = await as(base.bodeguero).post(
      "/api/damage-reports",
      damageBody(t.id, { occurredAt: "2025-03-05T10:00:00Z", kind: "PIEZA_FALTANTE", condition: "NO_OPERATIVA", photoIds: await photoIds(base.bodeguero, 1) }),
    );
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ toolStatus: "DANADA", lifecycleEvent: null });

    const history = await as(base.lector).get(`/api/tools/${t.id}/damage-reports`);
    expect(history.status).toBe(200);
    expect(history.body.map((r: { kind: string }) => r.kind)).toEqual(["PIEZA_FALTANTE", "FALLA"]); // más reciente primero
    expect(history.body[0].photos).toHaveLength(1);
    expect(history.body[1].photos).toHaveLength(2);
    expect(history.body[1].reportedBy.name).toBe("Supervisor");

    // El historial general muestra las fotos del reporte en su evento DAMAGE.
    const timeline = await as(base.lector).get(`/api/tools/${t.id}/history`);
    const damage = timeline.body.find((e: { type: string }) => e.type === "DAMAGE");
    expect(damage.damageReport.photos).toHaveLength(2);
  });

  it("los reportes no se pueden modificar ni borrar (trigger en BD)", async () => {
    const t = await createTool(base);
    const res = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id));
    await expect(prisma.damageReport.update({ where: { id: res.body.id }, data: { description: "otra" } })).rejects.toThrow();
    await expect(prisma.damageReport.delete({ where: { id: res.body.id } })).rejects.toThrow();
  });

  it("un reintento con el mismo id no duplica el reporte", async () => {
    const t = await createTool(base);
    const body = damageBody(t.id, { photoIds: await photoIds(base.supervisor, 2) });
    const [a, b] = await Promise.all([
      as(base.supervisor).post("/api/damage-reports", body),
      as(base.supervisor).post("/api/damage-reports", body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect(await prisma.damageReport.count({ where: { toolId: t.id } })).toBe(1);
    // Otro usuario no puede "reclamar" ese id.
    expect((await as(base.bodeguero).post("/api/damage-reports", body)).status).toBe(409);
  });

  it("permisos: LECTOR y CHOFER no reportan; fotos ajenas no se pueden usar", async () => {
    const t = await createTool(base);
    expect((await as(base.lector).post("/api/damage-reports", damageBody(t.id))).status).toBe(403);
    const ajena = await fakePhoto(base.bodeguero);
    const res = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { photoIds: [ajena.id] }));
    expect(res.status).toBe(409);
    expect((await as(null).get(`/api/tools/${t.id}/damage-reports`)).status).toBe(401);
  });

  it("valida fecha (no futura, no antes de la compra) y estado de la herramienta", async () => {
    const t = await createTool(base);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect((await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { occurredAt: future }))).status).toBe(400);
    const before = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id, { occurredAt: "2024-01-01T00:00:00Z" }));
    expect(before.status).toBe(409);
    await as(base.supervisor).post("/api/lifecycle-events", { toolId: t.id, type: "LOSS", occurredAt: "2025-02-01T00:00:00Z" });
    const lost = await as(base.supervisor).post("/api/damage-reports", damageBody(t.id));
    expect(lost.status).toBe(409);
    expect(lost.body.error.code).toBe("DAMAGE_REJECTED");
  });
});

const rentalBody = (base: Base, overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  tool: { code: `REN-${randomUUID().slice(0, 4).toUpperCase()}`, categoryId: base.category.id, brand: "Hilti", model: "TE 70" },
  lessor: "Rentas del Norte",
  receivedAt: "2025-04-01T08:00:00Z",
  expectedReturnAt: "2025-05-01T08:00:00Z",
  locationId: base.bodega.id,
  receptionCondition: "CON_DETALLES",
  receptionDescription: "Rayones en la carcasa",
  photoIds: [],
  ...overrides,
});

const returnBody = (overrides: Record<string, unknown> = {}) => ({
  returnedAt: "2025-04-20T17:00:00Z",
  returnCondition: "CON_DETALLES",
  differences: "Golpe nuevo en la empuñadura",
  photoIds: [],
  ...overrides,
});

describe("herramientas rentadas (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it("recepción: da de alta la herramienta como rentada, sin precio, con sus fotos de recepción", async () => {
    const photos = await uploadReal(base.bodeguero, 3);
    const res = await as(base.bodeguero).post("/api/rentals", rentalBody(base, { photoIds: photos }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "ACTIVO", lessor: "Rentas del Norte", receptionCondition: "CON_DETALLES" });
    expect(res.body.photos.map((p: { stage: string }) => p.stage)).toEqual(["RECEPCION", "RECEPCION", "RECEPCION"]);

    const tool = await as(base.admin).get(`/api/tools/${res.body.tool.id}`);
    expect(tool.body).toMatchObject({ ownership: "RENTADA", purchasePrice: "0", status: "BODEGA", supplier: "Rentas del Norte" });
    // Quien no ve valores recibe la herramienta sin precio (la API no lo envía).
    const asLector = await as(base.lector).get(`/api/tools/${res.body.tool.id}`);
    expect(asLector.body).toMatchObject({ ownership: "RENTADA", status: "BODEGA" });
    expect(asLector.body).not.toHaveProperty("purchasePrice");
    const events = await toolEvents(res.body.tool.id);
    expect(events.map((e) => e.type)).toEqual(["RENTAL_RECEIVE"]); // sin evento de compra
    // Filtro propia/rentada.
    const rented = await as(base.lector).get("/api/tools?ownership=RENTADA");
    expect(rented.body.total).toBe(1);
    // No suma al inventario.
    const summary = await as(base.admin).get("/api/reports/summary");
    expect(summary.body.inventoryValue).toBe("0.00");
    // Ni es una compra (no es un activo de la empresa).
    expect(summary.body.purchases).toEqual({ count: 0, value: "0" });
  });

  it("incidencias: un daño durante el alquiler queda en ese alquiler, con sus fotos, sin tocar la recepción", async () => {
    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base, { photoIds: await photoIds(base.bodeguero, 2) }))).body;
    const incident = await as(base.supervisor).post(
      "/api/damage-reports",
      damageBody(rental.tool.id, { occurredAt: "2025-04-10T09:00:00Z", kind: "PIEZA_FALTANTE", photoIds: await photoIds(base.supervisor, 3) }),
    );
    expect(incident.status).toBe(201);
    expect(incident.body.rental).toMatchObject({ id: rental.id });

    const detail = await as(base.lector).get(`/api/rentals/${rental.id}`);
    expect(detail.body.incidents).toHaveLength(1);
    expect(detail.body.incidents[0].photos).toHaveLength(3);
    expect(detail.body.photos.filter((p: { stage: string }) => p.stage === "RECEPCION")).toHaveLength(2);
    expect(detail.body).toMatchObject({ receptionCondition: "CON_DETALLES", receptionDescription: "Rayones en la carcasa" });
    // Una incidencia con fecha anterior a la recepción no pertenece a este alquiler.
    const before = await as(base.supervisor).post("/api/damage-reports", damageBody(rental.tool.id, { occurredAt: "2025-03-01T00:00:00Z" }));
    expect(before.status).toBe(409);
  });

  it("devolución: guarda sus fotos aparte, conserva las de recepción y deja la herramienta DEVUELTA", async () => {
    const reception = await photoIds(base.bodeguero, 2);
    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base, { photoIds: reception }))).body;
    const devolution = await photoIds(base.bodeguero, 2);
    const res = await as(base.bodeguero).post(`/api/rentals/${rental.id}/return`, returnBody({ photoIds: devolution }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: "DEVUELTO", returnCondition: "CON_DETALLES", returnDifferences: "Golpe nuevo en la empuñadura" });
    expect(res.body.returnedBy).toMatchObject({ id: base.bodeguero.id });
    const byStage = (stage: string) => res.body.photos.filter((p: { stage: string }) => p.stage === stage).map((p: { id: string }) => p.id).sort();
    expect(byStage("RECEPCION")).toEqual([...reception].sort());
    expect(byStage("DEVOLUCION")).toEqual([...devolution].sort());
    expect(await toolState(rental.tool.id)).toMatchObject({ status: "DEVUELTA", currentLocationId: null });

    // Una devolución distinta no sobrescribe la anterior; el mismo envío (reintento) sí responde bien.
    expect((await as(base.bodeguero).post(`/api/rentals/${rental.id}/return`, returnBody())).status).toBe(200);
    const other = await as(base.bodeguero).post(`/api/rentals/${rental.id}/return`, returnBody({ returnedAt: "2025-04-21T10:00:00Z" }));
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("ALREADY_RETURNED");
    // Las fotos de recepción no se pueden pasar a otra etapa ni a otro alquiler (trigger en BD).
    await expect(prisma.photo.update({ where: { id: reception[0] }, data: { stage: "DEVOLUCION" } })).rejects.toThrow();
    await expect(prisma.rental.update({ where: { id: rental.id }, data: { returnNotes: "x" } })).rejects.toThrow();
    // Una devuelta ya no se traslada ni admite reportes.
    expect((await as(base.supervisor).post("/api/damage-reports", damageBody(rental.tool.id, { occurredAt: "2025-04-25T00:00:00Z" }))).status).toBe(409);
  });

  it("la recepción no se puede modificar (trigger en BD)", async () => {
    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base))).body;
    await expect(prisma.rental.update({ where: { id: rental.id }, data: { receptionCondition: "BUENO" } })).rejects.toThrow();
    await expect(prisma.rental.delete({ where: { id: rental.id } })).rejects.toThrow();
  });

  it("varios períodos de alquiler de la misma herramienta quedan separados", async () => {
    const first = (await as(base.bodeguero).post("/api/rentals", rentalBody(base, { photoIds: await photoIds(base.bodeguero, 1) }))).body;
    const toolId = first.tool.id;
    await as(base.supervisor).post("/api/damage-reports", damageBody(toolId, { occurredAt: "2025-04-05T00:00:00Z" }));
    await as(base.bodeguero).post(`/api/rentals/${first.id}/return`, returnBody());

    // No puede haber dos activos a la vez ni reabrir con fecha anterior a la última devolución.
    const early = await as(base.bodeguero).post(
      "/api/rentals",
      { ...rentalBody(base), tool: undefined, toolId, receivedAt: "2025-04-15T00:00:00Z", expectedReturnAt: undefined },
    );
    expect(early.status, JSON.stringify(early.body)).toBe(409);

    const second = await as(base.bodeguero).post("/api/rentals", {
      ...rentalBody(base),
      tool: undefined,
      toolId,
      lessor: "Equipos Sula",
      receivedAt: "2025-06-01T08:00:00Z",
      expectedReturnAt: undefined,
      locationId: base.obraA.id,
      photoIds: await photoIds(base.bodeguero, 2),
    });
    expect(second.status).toBe(201);
    expect((await toolState(toolId)).status).toBe("EN_PROYECTO"); // llegó directo a la obra
    const again = await as(base.bodeguero).post("/api/rentals", { ...rentalBody(base), tool: undefined, toolId, receivedAt: "2025-06-02T08:00:00Z", expectedReturnAt: undefined });
    expect(again.status).toBe(409); // ya hay un alquiler activo

    await as(base.supervisor).post("/api/damage-reports", damageBody(toolId, { occurredAt: "2025-06-03T00:00:00Z", kind: "FALLA" }));

    const list = await as(base.lector).get(`/api/rentals?toolId=${toolId}`);
    expect(list.body.data.map((r: { lessor: string; status: string }) => [r.lessor, r.status])).toEqual([
      ["Equipos Sula", "ACTIVO"],
      ["Rentas del Norte", "DEVUELTO"],
    ]);
    const d1 = (await as(base.lector).get(`/api/rentals/${first.id}`)).body;
    const d2 = (await as(base.lector).get(`/api/rentals/${second.body.id}`)).body;
    expect(d1.incidents.map((i: { kind: string }) => i.kind)).toEqual(["GOLPE"]);
    expect(d2.incidents.map((i: { kind: string }) => i.kind)).toEqual(["FALLA"]);
    expect(d1.photos).toHaveLength(1);
    expect(d2.photos).toHaveLength(2);
  });

  it("una herramienta propia no se registra como alquiler y una rentada no recibe precio", async () => {
    const own = await createTool(base);
    const res = await as(base.bodeguero).post("/api/rentals", { ...rentalBody(base), tool: undefined, toolId: own.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NOT_RENTED");

    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base))).body;
    const priced = await as(base.admin).patch(`/api/tools/${rental.tool.id}`, { purchasePrice: "500.00" });
    expect(priced.status).toBe(400);
  });

  it("permisos: solo bodega/admin reciben y devuelven; todos los lectores consultan", async () => {
    expect((await as(base.supervisor).post("/api/rentals", rentalBody(base))).status).toBe(403);
    expect((await as(base.lector).post("/api/rentals", rentalBody(base))).status).toBe(403);
    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base))).body;
    expect((await as(base.supervisor).post(`/api/rentals/${rental.id}/return`, returnBody())).status).toBe(403);
    expect((await as(base.lector).get(`/api/rentals/${rental.id}`)).status).toBe(200);
  });

  it("un reintento de la recepción con el mismo id no duplica herramienta ni alquiler", async () => {
    const body = rentalBody(base);
    const a = await as(base.bodeguero).post("/api/rentals", body);
    const b = await as(base.bodeguero).post("/api/rentals", body);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.id).toBe(a.body.id);
    expect(await prisma.tool.count({ where: { ownership: "RENTADA" } })).toBe(1);
  });

  it("el Excel exporta las herramientas rentadas y sus eventos", async () => {
    const rental = (await as(base.bodeguero).post("/api/rentals", rentalBody(base))).body;
    await as(base.bodeguero).post(`/api/rentals/${rental.id}/return`, returnBody());
    const res = await as(base.lector).get("/api/reports/export/inventory.xlsx");
    expect(res.status).toBe(200);
  });
});
