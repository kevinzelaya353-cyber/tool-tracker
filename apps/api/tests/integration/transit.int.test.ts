import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "../../src/modules/auth/auth.service.js";
import {
  as,
  createTool,
  createUser,
  prisma,
  resetDb,
  seedBase,
  toolEvents,
  toolState,
  transferBody,
  type Base,
  type TestUser,
} from "./helpers.js";

const RECEIVER_PIN = "4829";

describe("traslado con chofer (integración)", () => {
  let base: Base;
  let chofer: TestUser;

  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
    chofer = await createUser("CHOFER", { name: "Luis (chofer)" });
    // Quien recibe en la obra entra con PIN.
    await prisma.user.update({ where: { id: base.receptor.id }, data: { passwordHash: await hashPassword(RECEIVER_PIN) } });
  });
  afterAll(() => prisma.$disconnect());

  /** Salida desde bodega hacia la obra A con el chofer. */
  async function dispatch(toolIds: string[], by: TestUser = chofer) {
    const res = await as(by).post("/api/transfers", transferBody(base, toolIds, { driverId: chofer.id }));
    if (res.status !== 201) throw new Error(`dispatch falló: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string; status: string };
  }

  const receiveBody = (toolIds: string[], over: Record<string, unknown> = {}) => ({
    receivedAt: "2025-02-01T10:00:00Z",
    items: toolIds.map((toolId) => ({ toolId, outcome: "RECIBIDA" })),
    ...over,
  });

  it("la salida deja las herramientas en tránsito, sin ubicación y a cargo del chofer", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    expect(tr.status).toBe("EN_TRANSITO");
    expect(await toolState(t.id)).toEqual({ status: "EN_TRANSITO", currentLocationId: null, currentCustodianId: chofer.id });
    expect((await toolEvents(t.id)).map((e) => e.type)).toEqual(["PURCHASE", "DISPATCH"]);

    // Mi carga: filtro por chofer y estado.
    const mine = await as(chofer).get(`/api/transfers?status=EN_TRANSITO&driverId=${chofer.id}`);
    expect(mine.body.data.map((x: { id: string }) => x.id)).toEqual([tr.id]);
  });

  it("en tránsito no puede volver a salir, ni trasladarse directo, ni recibir eventos manuales", async () => {
    const t = await createTool(base);
    await dispatch([t.id]);
    expect((await as(chofer).post("/api/transfers", transferBody(base, [t.id], { driverId: chofer.id }))).status).toBe(409);
    expect((await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]))).status).toBe(409);
    const loss = await as(base.bodeguero).post("/api/lifecycle-events", { toolId: t.id, type: "LOSS", occurredAt: "2025-02-01T09:00:00Z" });
    expect(loss.status).toBe(409);
  });

  it("con chofer, las fotos de recepción no se aceptan al salir y el chofer no puede ser quien recibe", async () => {
    const t = await createTool(base);
    const withReception = transferBody(base, [t.id], { driverId: chofer.id, receptionPhotoIds: [randomUUID()] });
    expect((await as(chofer).post("/api/transfers", withReception)).status).toBe(400);
    const selfReceive = transferBody(base, [t.id], { driverId: base.receptor.id });
    expect((await as(chofer).post("/api/transfers", selfReceive)).body.error.code).toBe("INVALID_PERSON");
  });

  it("quien recibe confirma desde su sesión: llega a la obra a su cargo", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    const res = await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id]));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "RECIBIDO", receptionMethod: "SESION", receptionBy: { id: base.receptor.id } });
    expect(await toolState(t.id)).toEqual({ status: "EN_PROYECTO", currentLocationId: base.obraA.id, currentCustodianId: base.receptor.id });
    expect((await toolEvents(t.id)).map((e) => e.type)).toEqual(["PURCHASE", "DISPATCH", "TRANSFER"]);

    // Ya recibido: una segunda confirmación se rechaza.
    expect((await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id]))).status).toBe(409);
  });

  it("el chofer confirma con el PIN de quien recibe; sin PIN no puede", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    const without = await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id]));
    expect(without.status).toBe(403);
    const wrong = await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { pin: "0571" }));
    expect(wrong.status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: base.receptor.id } })).failedLogins).toBe(1);

    const ok = await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { pin: RECEIVER_PIN }));
    expect(ok.status).toBe(200);
    expect(ok.body.receptionMethod).toBe("PIN");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: base.receptor.id } })).failedLogins).toBe(0);
  });

  it("5 PIN incorrectos en el teléfono del chofer bloquean la cuenta de quien recibe", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    for (let i = 0; i < 4; i++) {
      expect((await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { pin: "0571" }))).status).toBe(403);
    }
    const fifth = await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { pin: "0571" }));
    expect(fifth.status).toBe(423);
    // Ni con el PIN correcto, y su login también queda bloqueado.
    expect((await as(chofer).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { pin: RECEIVER_PIN }))).status).toBe(423);
    expect(await toolState(t.id)).toMatchObject({ status: "EN_TRANSITO" });
  });

  it("un bodeguero puede confirmar en nombre de quien recibe (queda como supervisión)", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    const res = await as(base.bodeguero).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id]));
    expect(res.status).toBe(200);
    expect(res.body.receptionMethod).toBe("SUPERVISION");
  });

  it("lista de verificación: dañada llega al destino como DANADA; la que no llegó queda extraviada a cargo del chofer", async () => {
    const [ok, damaged, missing] = [await createTool(base), await createTool(base), await createTool(base)];
    const tr = await dispatch([ok.id, damaged.id, missing.id]);
    const body = receiveBody([], {
      items: [
        { toolId: ok.id, outcome: "RECIBIDA" },
        { toolId: damaged.id, outcome: "DANADA", note: "Carcasa rota" },
        { toolId: missing.id, outcome: "NO_LLEGO", note: "No venía en el camión" },
      ],
    });
    // Sin describir lo que pasó, se rechaza.
    const noNote = receiveBody([ok.id, damaged.id, missing.id], {
      items: [
        { toolId: ok.id, outcome: "RECIBIDA" },
        { toolId: damaged.id, outcome: "DANADA" },
        { toolId: missing.id, outcome: "RECIBIDA" },
      ],
    });
    expect((await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, noNote)).status).toBe(400);

    expect((await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, body)).status).toBe(200);
    expect(await toolState(ok.id)).toEqual({ status: "EN_PROYECTO", currentLocationId: base.obraA.id, currentCustodianId: base.receptor.id });
    expect(await toolState(damaged.id)).toEqual({ status: "DANADA", currentLocationId: base.obraA.id, currentCustodianId: base.receptor.id });
    expect((await toolEvents(damaged.id)).map((e) => e.type)).toEqual(["PURCHASE", "DISPATCH", "TRANSFER", "DAMAGE"]);
    expect(await toolState(missing.id)).toEqual({ status: "EXTRAVIADA", currentLocationId: null, currentCustodianId: chofer.id });
    const loss = (await toolEvents(missing.id)).at(-1)!;
    expect(loss).toMatchObject({ type: "LOSS", fromStatus: "EN_TRANSITO" });
    expect(loss.description).toContain("Luis (chofer)");
  });

  it("hay que indicar el resultado de cada herramienta del traslado", async () => {
    const [a, b] = [await createTool(base), await createTool(base)];
    const tr = await dispatch([a.id, b.id]);
    const res = await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, receiveBody([a.id]));
    expect(res.body.error.code).toBe("ITEMS_MISMATCH");
  });

  it("la llegada no puede ser anterior a la salida", async () => {
    const t = await createTool(base);
    const tr = await dispatch([t.id]);
    const res = await as(base.receptor).post(`/api/transfers/${tr.id}/receive`, receiveBody([t.id], { receivedAt: "2025-01-31T10:00:00Z" }));
    expect(res.body.error.code).toBe("OUT_OF_ORDER");
  });

  it("no se puede cerrar un proyecto con herramientas en camino hacia él", async () => {
    const t = await createTool(base);
    await dispatch([t.id]);
    const res = await as(base.bodeguero).patch(`/api/locations/${base.obraA.id}`, { active: false });
    expect(res.body.error.code).toBe("LOCATION_HAS_INCOMING");
  });

  it("el chofer no da de alta herramientas ni reporta eventos", async () => {
    const t = await createTool(base);
    expect((await as(chofer).post("/api/tools", { code: "X-1", categoryId: base.category.id, brand: "X", purchasePrice: "1.00", purchaseDate: "2025-01-10", initialLocationId: base.bodega.id })).status).toBe(403);
    expect((await as(chofer).post("/api/lifecycle-events", { toolId: t.id, type: "DAMAGE", occurredAt: "2025-02-01T09:00:00Z" })).status).toBe(403);
  });

  it("el Excel lista lo que está en camino", async () => {
    const t = await createTool(base);
    await dispatch([t.id]);
    const res = await as(base.lector)
      .get("/api/reports/export/inventory.xlsx")
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    const sheet = wb.getWorksheet("En tránsito")!;
    expect(sheet.getRow(2).getCell(3).value).toBe("Luis (chofer)");
    expect(sheet.getRow(2).getCell(8).value).toBe(t.code);
  });
});
