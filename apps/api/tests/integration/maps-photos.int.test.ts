import ExcelJS from "exceljs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, createTool, fakePhoto, prisma, resetDb, seedBase, transferBody, type Base } from "./helpers.js";

const TEGUS = { latitude: 14.0723, longitude: -87.1921 };
const COMAYAGUA = { latitude: 14.4597, longitude: -87.6374 };

describe("mapa y fotos de traslados y herramientas (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  describe("coordenadas y ruta", () => {
    it("valida coordenadas: ambas o ninguna y dentro de rango", async () => {
      const ok = await as(base.bodeguero).post("/api/locations", { name: "Obra C", type: "PROYECTO", ...TEGUS });
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject(TEGUS);
      expect((await as(base.bodeguero).post("/api/locations", { name: "X", type: "PROYECTO", latitude: 14 })).status).toBe(400);
      expect((await as(base.bodeguero).post("/api/locations", { name: "Y", type: "PROYECTO", latitude: 95, longitude: 0 })).status).toBe(400);
      // null quita el punto.
      const cleared = await as(base.bodeguero).patch(`/api/locations/${ok.body.id}`, { latitude: null, longitude: null });
      expect(cleared.body.latitude).toBeNull();
    });

    it("con ambos puntos el traslado guarda la ruta; sin puntos no", async () => {
      const t = await createTool(base);
      const noRoute = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
      expect(noRoute.status).toBe(201);
      expect(noRoute.body.routeGeometry).toBeNull();

      await as(base.bodeguero).patch(`/api/locations/${base.obraA.id}`, TEGUS);
      await as(base.bodeguero).patch(`/api/locations/${base.obraB.id}`, COMAYAGUA);
      const res = await as(base.bodeguero).post(
        "/api/transfers",
        transferBody(base, [t.id], { fromLocationId: base.obraA.id, toLocationId: base.obraB.id, movedAt: "2025-03-01T08:00:00Z" }),
      );
      expect(res.status).toBe(201);
      expect(res.body.routeGeometry).toHaveLength(3);
      expect(res.body.routeGeometry[0]).toEqual([TEGUS.latitude, TEGUS.longitude]);
      expect(res.body.routeDistanceM).toBe(38740);
      expect(res.body.toLocation).toMatchObject(COMAYAGUA);
    });

    it("un traslado anterior obtiene su ruta al abrirlo cuando sus ubicaciones ya tienen punto", async () => {
      const t = await createTool(base);
      const created = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
      await prisma.location.update({ where: { id: base.bodega.id }, data: TEGUS });
      await prisma.location.update({ where: { id: base.obraA.id }, data: COMAYAGUA });

      const detail = await as(base.lector).get(`/api/transfers/${created.body.id}`);
      expect(detail.body.routeGeometry).toHaveLength(3);
      const stored = await prisma.transfer.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(stored.routeDistanceM).toBe(38740);
    });
  });

  describe("fotos de entrega y recepción", () => {
    it("separa las fotos por etapa al registrar el traslado", async () => {
      const t = await createTool(base);
      const [d, r] = [await fakePhoto(base.bodeguero), await fakePhoto(base.bodeguero)];
      const res = await as(base.bodeguero).post(
        "/api/transfers",
        transferBody(base, [t.id], { photoIds: [d.id], receptionPhotoIds: [r.id] }),
      );
      expect(res.status).toBe(201);
      const stages = Object.fromEntries(res.body.photos.map((p: { id: string; stage: string }) => [p.id, p.stage]));
      expect(stages).toEqual({ [d.id]: "ENTREGA", [r.id]: "RECEPCION" });
    });

    it("quien recibe agrega fotos después; no puede usar fotos ajenas ni un lector agregar", async () => {
      const t = await createTool(base);
      const created = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
      const id = created.body.id as string;

      const mine = await fakePhoto(base.receptor);
      const res = await as(base.receptor).post(`/api/transfers/${id}/photos`, { photoIds: [mine.id], stage: "RECEPCION" });
      expect(res.status).toBe(200);
      expect(res.body.photos).toEqual([expect.objectContaining({ id: mine.id, stage: "RECEPCION" })]);
      expect(await prisma.auditLog.count({ where: { action: "transfer.add_photos", entityId: id } })).toBe(1);

      const foreign = await fakePhoto(base.bodeguero);
      expect((await as(base.receptor).post(`/api/transfers/${id}/photos`, { photoIds: [foreign.id], stage: "RECEPCION" })).status).toBe(409);
      // Una foto ya asociada no se puede volver a usar.
      expect((await as(base.receptor).post(`/api/transfers/${id}/photos`, { photoIds: [mine.id], stage: "ENTREGA" })).status).toBe(409);
      const lectorPhoto = await fakePhoto(base.lector);
      expect((await as(base.lector).post(`/api/transfers/${id}/photos`, { photoIds: [lectorPhoto.id], stage: "RECEPCION" })).status).toBe(403);
    });
  });

  describe("eliminar fotos desde la app", () => {
    it("una foto de traslado se oculta en la app pero se conserva para el Excel", async () => {
      const t = await createTool(base);
      const [bad, good] = [await fakePhoto(base.bodeguero), await fakePhoto(base.bodeguero)];
      const created = await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { photoIds: [bad.id, good.id] }));
      const id = created.body.id as string;

      expect((await as(base.lector).delete(`/api/media/${bad.id}`)).status).toBe(403);
      expect((await as(base.supervisor).delete(`/api/media/${bad.id}`)).status).toBe(204);
      expect((await as(base.supervisor).delete(`/api/media/${bad.id}`)).status).toBe(404); // ya eliminada

      const detail = await as(base.lector).get(`/api/transfers/${id}`);
      expect(detail.body.photos.map((p: { id: string }) => p.id)).toEqual([good.id]);
      const urls = await as(base.lector).post("/api/media/urls", { ids: [bad.id, good.id] });
      expect(Object.keys(urls.body.urls)).toEqual([good.id]);

      // Sigue en la base de datos (para el Excel) y queda auditado.
      expect((await prisma.photo.findUniqueOrThrow({ where: { id: bad.id } })).hiddenAt).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { action: "photo.hide", entityId: bad.id } })).toBe(1);
    });

    it("al eliminar la foto propia de la herramienta, la herramienta queda sin foto", async () => {
      const photo = await fakePhoto(base.bodeguero);
      const created = await as(base.bodeguero).post("/api/tools", {
        code: "FOTO-DEL",
        categoryId: base.category.id,
        brand: "Bosch",
        purchasePrice: "50.00",
        purchaseDate: "2025-01-10",
        initialLocationId: base.bodega.id,
        photoId: photo.id,
      });
      expect((await as(base.bodeguero).delete(`/api/media/${photo.id}`)).status).toBe(204);
      const tool = await as(base.lector).get(`/api/tools/${created.body.id}`);
      expect(tool.body.coverPhotoId).toBeNull();
      expect(tool.body.photos).toEqual([]);
    });
  });

  describe("foto de la herramienta", () => {
    it("se registra al dar de alta y se puede cambiar; la anterior queda en su historial", async () => {
      const first = await fakePhoto(base.bodeguero);
      const created = await as(base.bodeguero).post("/api/tools", {
        code: "FOTO-1",
        categoryId: base.category.id,
        brand: "Bosch",
        purchasePrice: "50.00",
        purchaseDate: "2025-01-10",
        initialLocationId: base.bodega.id,
        photoId: first.id,
      });
      expect(created.status).toBe(201);
      expect(created.body.coverPhotoId).toBe(first.id);

      const second = await fakePhoto(base.bodeguero);
      const changed = await as(base.bodeguero).put(`/api/tools/${created.body.id}/photo`, { photoId: second.id });
      expect(changed.status).toBe(200);
      expect(changed.body.coverPhotoId).toBe(second.id);
      expect(await prisma.photo.count({ where: { toolId: created.body.id } })).toBe(2);

      // Lector no cambia fotos; nadie puede usar una foto ajena.
      const other = await fakePhoto(base.supervisor);
      expect((await as(base.lector).put(`/api/tools/${created.body.id}/photo`, { photoId: null })).status).toBe(403);
      expect((await as(base.bodeguero).put(`/api/tools/${created.body.id}/photo`, { photoId: other.id })).status).toBe(409);
    });
  });

  it("el Excel incluye historial por herramienta y hoja de traslados con distancia y enlace a la ruta", async () => {
    await as(base.bodeguero).patch(`/api/locations/${base.bodega.id}`, TEGUS);
    await as(base.bodeguero).patch(`/api/locations/${base.obraA.id}`, COMAYAGUA);
    const t = await createTool(base, { code: "HIST-1" });
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id], { notes: "Para cimientos" }));

    const res = await as(base.lector)
      .get("/api/reports/export/inventory.xlsx")
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    expect(wb.worksheets.map((w) => w.name).slice(0, 4)).toEqual(["Resumen", "Herramientas", "Historial", "Traslados"]);

    const hist = wb.getWorksheet("Historial")!;
    expect(String(hist.getRow(2).getCell(2).value)).toContain("HIST-1");
    expect(hist.getRow(3).getCell(2).value).toBe("Alta (compra)");
    expect(hist.getRow(4).getCell(2).value).toBe("Traslado");
    expect(hist.getRow(4).getCell(3).value).toBe(base.bodega.name);
    expect(hist.getRow(4).getCell(4).value).toBe(base.obraA.name);
    expect(hist.getRow(4).getCell(8).value).toBe(38.7);

    const transfers = wb.getWorksheet("Traslados")!;
    expect(transfers.getRow(2).getCell(4).value).toBe("HIST-1");
    const route = transfers.getRow(2).getCell(10).value as { hyperlink: string };
    expect(route.hyperlink).toContain("openstreetmap.org/directions");
  });
});
