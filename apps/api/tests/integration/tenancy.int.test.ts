import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as,
  createTool,
  createUser,
  fakePhoto,
  PASSWORD,
  prisma,
  resetDb,
  seedBase,
  transferBody,
  type Base,
} from "./helpers.js";

const xlsx = (r: { on(e: string, cb: (c?: Buffer) => void): void }, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  r.on("data", (c) => chunks.push(c!));
  r.on("end", () => cb(null, Buffer.concat(chunks)));
};

/**
 * Aislamiento entre organizaciones: dos empresas con la misma estructura (mismos nombres de
 * bodega, misma placa, mismo código de herramienta) y ninguna puede ver ni tocar lo de la otra.
 */
describe("aislamiento multi-tenant (integración)", () => {
  let A: Base;
  let B: Base;
  let toolA: { id: string; code: string };
  let toolB: { id: string; code: string };

  beforeAll(async () => {
    await resetDb();
    A = await seedBase("Empresa A");
    B = await seedBase("Empresa B");
    // El mismo código en las dos: es único dentro de cada organización, no en la plataforma.
    toolA = await createTool(A, { code: "TAL-0001", purchasePrice: "100.00" });
    toolB = await createTool(B, { code: "TAL-0001", purchasePrice: "999.00" });
    await createTool(B, { code: "SOLO-B-01", purchasePrice: "50.00" });
  });

  afterAll(() => prisma.$disconnect());

  it("1-2. cada empresa ve solo sus herramientas (listado, conteos, detalle, código QR)", async () => {
    const listA = await as(A.lector).get("/api/tools");
    expect(listA.body.data.map((t: { id: string }) => t.id)).toEqual([toolA.id]);
    const listB = await as(B.lector).get("/api/tools");
    expect(listB.body.total).toBe(2);
    expect(listB.body.data.map((t: { id: string }) => t.id)).not.toContain(toolA.id);

    const counts = await as(A.lector).get("/api/tools/categories");
    expect(counts.body).toEqual([expect.objectContaining({ id: A.category.id, count: 1 })]);

    // Por identificador o por código de otra organización: no existe (404, sin revelar nada).
    expect((await as(A.admin).get(`/api/tools/${toolB.id}`)).status).toBe(404);
    expect((await as(A.admin).get(`/api/tools/${toolB.id}/history`)).status).toBe(404);
    expect((await as(A.admin).get(`/api/tools/${toolB.id}/damage-reports`)).status).toBe(404);
    expect((await as(A.admin).get("/api/tools/by-code/SOLO-B-01")).status).toBe(404);
    const byCode = await as(A.admin).get("/api/tools/by-code/TAL-0001");
    expect(byCode.body.id).toBe(toolA.id);
  });

  it("catálogos: bodegas, categorías y vehículos de la propia organización", async () => {
    const locs = await as(A.lector).get("/api/locations");
    expect(locs.body.map((l: { id: string }) => l.id).sort()).toEqual([A.bodega.id, A.obraA.id, A.obraB.id].sort());
    const cats = await as(A.lector).get("/api/categories");
    expect(cats.body.map((c: { id: string }) => c.id)).toEqual([A.category.id]);
    const vehicles = await as(A.bodeguero).get("/api/vehicles");
    expect(vehicles.body.map((v: { id: string }) => v.id)).toEqual([A.vehicle.id]);

    expect((await as(A.admin).patch(`/api/locations/${B.obraA.id}`, { name: "Robada" })).status).toBe(404);
    expect((await as(A.admin).patch(`/api/categories/${B.category.id}`, { name: "Robada" })).status).toBe(404);
    expect((await as(A.admin).patch(`/api/vehicles/${B.vehicle.id}`, { active: false })).status).toBe(404);
    // Mismo nombre/placa que en B: no choca (único por organización).
    expect((await as(A.admin).post("/api/vehicles", { plate: "XYZ-999" })).status).toBe(201);
    expect((await as(B.admin).post("/api/vehicles", { plate: "XYZ-999" })).status).toBe(201);
  });

  it("6.3 relaciones: no se mezclan registros de dos organizaciones", async () => {
    // Traslado de A con una herramienta de B → la herramienta "no existe" en A.
    const t1 = await as(A.bodeguero).post("/api/transfers", transferBody(A, [toolB.id]));
    expect(t1.status).toBe(409);
    expect(t1.body.error.details[0].code).toBe("NOT_FOUND");
    // Con personas, vehículo o destino de B.
    expect((await as(A.bodeguero).post("/api/transfers", transferBody(A, [toolA.id], { receivedById: B.receptor.id }))).body.error.code).toBe(
      "INVALID_PERSON",
    );
    expect((await as(A.bodeguero).post("/api/transfers", transferBody(A, [toolA.id], { vehicleId: B.vehicle.id }))).body.error.code).toBe(
      "INVALID_VEHICLE",
    );
    expect((await as(A.bodeguero).post("/api/transfers", transferBody(A, [toolA.id], { toLocationId: B.obraA.id }))).status).toBe(400);
    // Eventos, daños y alta de herramientas apuntando a B.
    expect(
      (await as(A.bodeguero).post("/api/lifecycle-events", { toolId: toolB.id, type: "LOSS", occurredAt: "2025-03-01T10:00:00Z" })).status,
    ).toBe(404);
    expect(
      (
        await as(A.bodeguero).post("/api/damage-reports", {
          id: crypto.randomUUID(),
          toolId: toolB.id,
          kind: "GOLPE",
          condition: "NO_OPERATIVA",
          description: "x",
          occurredAt: "2025-03-01T10:00:00Z",
          photoIds: [],
        })
      ).status,
    ).toBe(404);
    const crossCategory = await as(A.bodeguero).post("/api/tools", {
      code: "CRUZ-001",
      categoryId: B.category.id,
      brand: "X",
      purchasePrice: "1.00",
      purchaseDate: "2025-01-10",
      initialLocationId: A.bodega.id,
    });
    expect(crossCategory.body.error.code).toBe("INVALID_CATEGORY");
    // Nada de B cambió.
    expect((await prisma.tool.findUniqueOrThrow({ where: { id: toolB.id } })).status).toBe("BODEGA");
  });

  it("3-4. el administrador solo gestiona usuarios de su organización y no crea SuperAdmins", async () => {
    const users = await as(A.admin).get("/api/users?includeInactive=true");
    const ids = users.body.map((u: { id: string }) => u.id);
    expect(ids).toContain(A.bodeguero.id);
    expect(ids).not.toContain(B.bodeguero.id);

    expect((await as(A.admin).get(`/api/users/${B.bodeguero.id}`)).status).toBe(404);
    expect((await as(A.admin).patch(`/api/users/${B.bodeguero.id}`, { active: false })).status).toBe(404);
    expect((await as(A.admin).post(`/api/users/${B.bodeguero.id}/reset-password`, { password: "4826" })).status).toBe(404);
    expect((await as(A.admin).post(`/api/users/${B.bodeguero.id}/revoke-sessions`)).status).toBe(404);
    expect((await as(A.admin).del(`/api/users/${B.lector.id}`)).status).toBe(404);

    const superadmin = await as(A.admin).post("/api/users", { name: "Yo", username: "quiero-ser-super", password: "Clave-segura-123", role: "SUPERADMIN" });
    expect(superadmin.status).toBe(400);
    expect((await as(A.admin).patch(`/api/users/${A.bodeguero.id}`, { role: "SUPERADMIN" })).status).toBe(400);

    // Un organizationId en el cuerpo se ignora: el usuario nace en la organización de quien lo crea.
    const sneaky = await as(A.admin).post("/api/users", {
      name: "Infiltrado",
      username: "infiltrado-b",
      password: "4826",
      role: "LECTOR",
      organizationId: B.org.id,
    });
    expect(sneaky.status).toBe(201);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: sneaky.body.id } })).organizationId).toBe(A.org.id);
    expect((await as(B.admin).get(`/api/users/${sneaky.body.id}`)).status).toBe(404);
  });

  it("5. los usuarios operativos conservan sus permisos dentro de su organización", async () => {
    const move = await as(A.supervisor).post("/api/transfers", transferBody(A, [toolA.id], { movedAt: "2025-02-01T08:00:00Z" }));
    expect(move.status).toBe(201);
    expect((await as(A.supervisor).post("/api/tools", { code: "NO-001" })).status).toBe(403);
    expect((await as(A.lector).post("/api/vehicles", { plate: "LEC-001" })).status).toBe(403);
    const chofer = await createUser("CHOFER", { organizationId: A.org.id });
    expect((await as(chofer).get("/api/transfers")).status).toBe(200);
    expect((await as(chofer).get("/api/reports/summary")).status).toBe(403);
    // Los traslados de A no aparecen en B.
    expect((await as(B.admin).get("/api/transfers")).body.total).toBe(0);
    expect((await as(B.admin).get(`/api/transfers/${move.body.id}`)).status).toBe(404);
  });

  it("6-7. reportes y estadísticas cuentan solo la organización", async () => {
    const a = await as(A.admin).get("/api/reports/summary");
    const b = await as(B.admin).get("/api/reports/summary");
    expect(Number(a.body.purchaseTotal)).toBe(100);
    expect(Number(b.body.purchaseTotal)).toBe(1049);
    const detail = await as(A.admin).get("/api/reports/details?metric=tools");
    expect(detail.body.rows.map((r: { toolId: string }) => r.toolId)).toEqual([toolA.id]);
    // Filtrar por una ubicación de otra organización no revela nada.
    const foreign = await as(A.admin).get(`/api/reports/details?metric=tools&locationId=${B.bodega.id}`);
    expect(foreign.body.count).toBe(0);
    const losses = await as(A.admin).get("/api/reports/losses");
    expect(losses.body.rows).toEqual([]);
  });

  it("8. la exportación a Excel contiene solo la organización", async () => {
    const res = await as(A.admin).get("/api/reports/export/inventory.xlsx").buffer(true).parse(xlsx);
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    const all = wb.getWorksheet("Herramientas")!;
    const codes: unknown[] = [];
    all.eachRow((row, i) => i > 1 && codes.push(row.getCell(1).value));
    expect(codes).toEqual(["TAL-0001"]);
    // El precio exportado es el de A, no el de la herramienta homónima de B.
    expect(all.getRow(2).getCell(9).value).toBe(100);
  });

  it("9. fotos: una foto de otra organización no se ve, no se borra y no se puede usar", async () => {
    const photoB = await fakePhoto(B.bodeguero);
    await prisma.photo.update({ where: { id: photoB.id }, data: { toolId: toolB.id } }); // ya es evidencia en B
    const urls = await as(A.admin).post("/api/media/urls", { ids: [photoB.id] });
    expect(urls.body.urls).toEqual({});
    expect((await as(A.admin).del(`/api/media/${photoB.id}`)).status).toBe(404);

    const looseB = await fakePhoto(B.bodeguero);
    const attach = await as(A.bodeguero).post("/api/transfers", transferBody(A, [toolA.id], { photoIds: [looseB.id], fromLocationId: A.obraA.id, toLocationId: A.obraB.id, movedAt: "2025-02-02T08:00:00Z" }));
    expect(attach.body.error.code).toBe("PHOTO_UNAVAILABLE");
    // B sí ve su foto.
    expect(Object.keys((await as(B.admin).post("/api/media/urls", { ids: [photoB.id] })).body.urls)).toEqual([photoB.id]);
  });

  it("auditoría: el administrador ve solo la de su organización", async () => {
    const res = await as(A.admin).get("/api/audit?pageSize=100");
    expect(res.status).toBe(200);
    const orgs = new Set(res.body.data.map((r: { organizationId: string }) => r.organizationId));
    expect([...orgs]).toEqual([A.org.id]);
    // El filtro organizationId no sirve para salir de la propia.
    const forced = await as(A.admin).get(`/api/audit?organizationId=${B.org.id}`);
    expect(forced.body.data.every((r: { organizationId: string }) => r.organizationId === A.org.id)).toBe(true);
    expect((await as(A.bodeguero).get("/api/audit")).status).toBe(403);
  });

  it("6.2 el tenant sale del token: X-Org-Id de otra organización se rechaza y se audita", async () => {
    const res = await as(A.admin, { orgId: B.org.id }).get("/api/tools");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORG_MISMATCH");
    const denied = await prisma.auditLog.findFirst({ where: { action: "access.denied", actorId: A.admin.id }, orderBy: { at: "desc" } });
    expect(denied).toMatchObject({ result: "DENIED", organizationId: A.org.id });
    // La propia organización en la cabecera no molesta.
    expect((await as(A.admin, { orgId: A.org.id }).get("/api/tools")).status).toBe(200);
    // Las rutas de plataforma no existen para un administrador de organización.
    expect((await as(A.admin).get("/api/platform/organizations")).status).toBe(403);
    expect((await as(A.admin).post("/api/platform/impersonations", { userId: A.lector.id, reason: "quiero ver" })).status).toBe(403);
  });

  it("6.3 la base de datos rechaza relaciones entre organizaciones aunque se salte la API", async () => {
    const transfer = await prisma.transfer.findFirstOrThrow({ where: { organizationId: A.org.id } });
    await expect(
      prisma.$executeRaw`INSERT INTO transfer_items (id, transfer_id, tool_id) VALUES (gen_random_uuid(), ${transfer.id}::uuid, ${toolB.id}::uuid)`,
    ).rejects.toThrow(/TENANT_MISMATCH/);
    await expect(prisma.$executeRaw`UPDATE tools SET organization_id = ${A.org.id}::uuid WHERE id = ${toolB.id}::uuid`).rejects.toThrow(
      /TENANT_MISMATCH/,
    );
    await expect(
      prisma.$executeRaw`UPDATE tools SET category_id = ${B.category.id}::uuid WHERE id = ${toolA.id}::uuid`,
    ).rejects.toThrow(/TENANT_MISMATCH/);
    // Un usuario de organización sin organización (o un SuperAdmin con una) tampoco.
    await expect(prisma.$executeRaw`UPDATE users SET organization_id = NULL WHERE id = ${A.lector.id}::uuid`).rejects.toThrow();
  });

  it("una organización desactivada no puede entrar ni usar sus tokens vigentes", async () => {
    const superadmin = await createUser("SUPERADMIN");
    expect((await as(superadmin).patch(`/api/platform/organizations/${B.org.id}`, { active: false })).status).toBe(200);

    expect((await as(B.lector).get("/api/tools")).body.error.code).toBe("ORG_INACTIVE");
    const login = await as(null).post("/api/auth/login", { username: B.lector.username, password: PASSWORD });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("ORG_INACTIVE");
    // Contraseña incorrecta: no revela el estado de la organización.
    expect((await as(null).post("/api/auth/login", { username: B.lector.username, password: "otra-cosa" })).status).toBe(401);
    expect((await as(null).post("/api/auth/refresh", { refreshToken: B.lector.refreshToken })).status).toBe(401);
    // A no se ve afectada.
    expect((await as(A.lector).get("/api/tools")).status).toBe(200);

    await as(superadmin).patch(`/api/platform/organizations/${B.org.id}`, { active: true });
    expect((await as(B.admin).get("/api/tools")).status).toBe(200);
  });

  it("22. los registros históricos se conservan (nada de otra organización desapareció)", async () => {
    expect(await prisma.lifecycleEvent.count({ where: { organizationId: B.org.id } })).toBe(2);
    expect(await prisma.tool.count({ where: { organizationId: B.org.id } })).toBe(2);
  });
});
