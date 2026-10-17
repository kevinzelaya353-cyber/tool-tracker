import { createHmac } from "node:crypto";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, as, createTool, fakePhoto, prisma, resetDb, seedBase, storage, type Base } from "./helpers.js";

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("seguridad (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  describe("autenticación y autorización", () => {
    const PROTECTED: [string, string][] = [
      ["get", "/api/tools"],
      ["post", "/api/tools"],
      ["get", "/api/transfers"],
      ["post", "/api/transfers"],
      ["post", "/api/lifecycle-events"],
      ["get", "/api/locations"],
      ["get", "/api/vehicles"],
      ["get", "/api/categories"],
      ["get", "/api/users"],
      ["get", "/api/audit"],
      ["get", "/api/reports/summary"],
      ["post", "/api/media"],
      ["post", "/api/media/urls"],
      ["get", "/api/ruta-inexistente"], // tampoco revela qué rutas existen
    ];

    it.each(PROTECTED)("%s %s sin token → 401", async (method, path) => {
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path);
      expect(res.status).toBe(401);
    });

    it("rechaza JWT con alg=none, firma falsa o firmado con otra clave", async () => {
      const payload = { sub: base.admin.id, role: "ADMIN", iss: "tool-tracker-api", aud: "tool-tracker-app", exp: 9_999_999_999 };
      const none = `${b64url({ alg: "none", typ: "JWT" })}.${b64url(payload)}.`;
      const header = b64url({ alg: "HS256", typ: "JWT" });
      const forgedSig = createHmac("sha256", "otra-clave-cualquiera").update(`${header}.${b64url(payload)}`).digest("base64url");
      const forged = `${header}.${b64url(payload)}.${forgedSig}`;
      // Token real de un LECTOR con el rol cambiado a ADMIN en el payload (firma ya no coincide).
      const [h, , s] = base.lector.token.split(".");
      const escalated = `${h}.${b64url({ ...payload, sub: base.lector.id })}.${s}`;

      for (const token of [none, forged, escalated, "basura", ""]) {
        const res = await request(app).get("/api/users").set("Authorization", `Bearer ${token}`);
        expect(res.status).toBe(401);
      }
    });

    it("un rol no puede escalar privilegios", async () => {
      // BODEGUERO no gestiona usuarios ni lee auditoría.
      expect((await as(base.bodeguero).patch(`/api/users/${base.bodeguero.id}`, { role: "ADMIN" })).status).toBe(403);
      expect((await as(base.bodeguero).post("/api/users", { name: "x", email: "x@x.com", password: "Segura-12345", role: "ADMIN" })).status).toBe(403);
      expect((await as(base.bodeguero).get("/api/audit")).status).toBe(403);
      // LECTOR no escribe catálogos.
      expect((await as(base.lector).post("/api/locations", { name: "Obra X", type: "PROYECTO" })).status).toBe(403);
    });

    it("el administrador no puede bloquearse a sí mismo ni dejar el sistema sin administradores", async () => {
      expect((await as(base.admin).patch(`/api/users/${base.admin.id}`, { active: false })).body.error.code).toBe("SELF_LOCKOUT");
      expect((await as(base.admin).patch(`/api/users/${base.admin.id}`, { role: "LECTOR" })).body.error.code).toBe("SELF_LOCKOUT");

      // Con un segundo admin: degradar al otro funciona hasta que quede uno.
      const res = await as(base.admin).post("/api/users", { name: "Admin 2", email: "admin2@test.local", password: "Segura-12345", role: "ADMIN" });
      expect(res.status).toBe(201);
      expect((await as(base.admin).patch(`/api/users/${res.body.id}`, { role: "LECTOR" })).status).toBe(200);
    });

    it("SUPERVISOR solo ve nombre y rol de los usuarios (sin correos)", async () => {
      const res = await as(base.supervisor).get("/api/users");
      expect(res.status).toBe(200);
      for (const u of res.body) expect(Object.keys(u).sort()).toEqual(["id", "name", "role"]);
    });

    it("BODEGUERO registra personas sin acceso; SUPERVISOR no puede", async () => {
      const res = await as(base.bodeguero).post("/api/users/people", { name: "Juan Pérez" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name: "Juan Pérez", role: "LECTOR" });
      const person = await prisma.user.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(person.email).toBeNull();
      expect(person.passwordHash).toBeNull();
      expect((await as(base.supervisor).get("/api/users")).body.map((u: { id: string }) => u.id)).toContain(person.id);

      expect((await as(base.supervisor).post("/api/users/people", { name: "Otra" })).status).toBe(403);
      expect((await as(base.bodeguero).post("/api/users/people", { name: "  " })).status).toBe(400);
    });
  });

  describe("inyección y validación de entrada", () => {
    it.each(["' OR 1=1 --", "'; DROP TABLE tools; --", "%' UNION SELECT password_hash FROM users --", "\\x00"])(
      "búsqueda con payload SQL %j se trata como texto",
      async (payload) => {
        await createTool(base);
        const res = await as(base.lector).get(`/api/tools?q=${encodeURIComponent(payload)}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(await prisma.tool.count()).toBe(1); // la tabla sigue ahí
      },
    );

    it("un byte NUL real en la búsqueda se rechaza con 400 (PostgreSQL no lo admite en texto)", async () => {
      const res = await as(base.lector).get(`/api/tools?q=${encodeURIComponent("abc\u0000def")}`);
      expect(res.status).toBe(400);
    });

    it("rechaza ids que no son UUID y códigos con caracteres extraños", async () => {
      expect((await as(base.lector).get("/api/tools/1%20OR%201=1")).status).toBe(400);
      expect((await as(base.lector).get("/api/tools/by-code/..%2F..%2Fetc")).status).toBe(400);
    });

    it("rechaza JSON mal formado y cuerpos demasiado grandes sin filtrar detalles internos", async () => {
      const bad = await request(app)
        .post("/api/locations")
        .set("Authorization", `Bearer ${base.admin.token}`)
        .set("Content-Type", "application/json")
        .send("{oops");
      expect(bad.status).toBe(400);
      expect(JSON.stringify(bad.body)).not.toMatch(/at |stack|node_modules/);

      const big = await as(base.admin).post("/api/locations", { name: "x".repeat(200_000), type: "PROYECTO" });
      expect(big.status).toBe(413);
    });

    it("los errores de unicidad no exponen detalles de Prisma", async () => {
      await createTool(base, { code: "UNICO-1" });
      const res = await as(base.bodeguero).post("/api/tools", {
        code: "UNICO-1",
        categoryId: base.category.id,
        brand: "X",
        purchasePrice: "1",
        purchaseDate: "2025-01-01",
        initialLocationId: base.bodega.id,
      });
      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).not.toMatch(/prisma|Unique constraint|tools_code_key/i);
    });
  });

  describe("subida de fotos", () => {
    const jpegWithExif = () =>
      sharp({ create: { width: 64, height: 48, channels: 3, background: "#888" } })
        .withExif({ IFD0: { Artist: "Operario", Make: "TelefonoX" } })
        .jpeg()
        .toBuffer();

    it("acepta JPEG, lo re-codifica sin EXIF y usa una clave generada (no el nombre del archivo)", async () => {
      const res = await as(base.bodeguero)
        .upload("/api/media")
        .attach("photos", await jpegWithExif(), { filename: "../../etc/passwd.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(201);

      const photo = await prisma.photo.findUniqueOrThrow({ where: { id: res.body[0].id } });
      expect(photo.storageKey).toMatch(/^photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
      const stored = storage.objects.get(photo.storageKey)!;
      expect((await sharp(stored.body).metadata()).exif).toBeUndefined();
      expect(storage.objects.has(photo.thumbKey!)).toBe(true);
    });

    it("rechaza SVG/HTML disfrazados de imagen", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      const res = await as(base.bodeguero).upload("/api/media").attach("photos", svg, { filename: "x.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("UNSUPPORTED_IMAGE");
      expect(storage.objects.size).toBe(0);
    });

    it("si una foto del lote es inválida no se sube ninguna", async () => {
      const res = await as(base.bodeguero)
        .upload("/api/media")
        .attach("photos", await jpegWithExif(), { filename: "a.jpg", contentType: "image/jpeg" })
        .attach("photos", Buffer.from("no soy imagen"), { filename: "b.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(400);
      expect(storage.objects.size).toBe(0);
      expect(await prisma.photo.count()).toBe(0);
    });

    it("rechaza archivos de más de 15 MB y más de 5 por petición", async () => {
      const big = Buffer.alloc(16 * 1024 * 1024, 0xff);
      big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
      const tooBig = await as(base.bodeguero).upload("/api/media").attach("photos", big, { filename: "a.jpg", contentType: "image/jpeg" });
      expect(tooBig.status).toBe(413);

      const img = await jpegWithExif();
      let req = as(base.bodeguero).upload("/api/media");
      for (let i = 0; i < 6; i++) req = req.attach("photos", img, { filename: `${i}.jpg`, contentType: "image/jpeg" });
      expect((await req).status).toBe(400);
    });

    it("LECTOR no puede subir fotos", async () => {
      const res = await as(base.lector).upload("/api/media").attach("photos", await jpegWithExif(), { filename: "a.jpg", contentType: "image/jpeg" });
      expect(res.status).toBe(403);
    });

    it("las fotos sin asociar de otro usuario no son visibles ni borrables", async () => {
      const mine = await fakePhoto(base.supervisor);
      const urls = await as(base.bodeguero).post("/api/media/urls", { ids: [mine.id] });
      expect(urls.body.urls).toEqual({});
      expect((await as(base.bodeguero).del(`/api/media/${mine.id}`)).status).toBe(404);
      expect((await as(base.supervisor).post("/api/media/urls", { ids: [mine.id] })).body.urls[mine.id]).toBeTruthy();
    });
  });

  describe("auditoría", () => {
    it("nunca guarda contraseñas en el log", async () => {
      await as(base.admin).post("/api/users", { name: "Nuevo", email: "nuevo@test.local", password: "Secreta-98765", role: "LECTOR" });
      await as(base.admin).patch(`/api/users/${base.lector.id}`, { password: "OtraSecreta-1234" });
      const logs = await prisma.auditLog.findMany({ where: { entity: "user" } });
      const dump = JSON.stringify(logs.map((l) => l.diff));
      expect(dump).not.toContain("Secreta-98765");
      expect(dump).not.toContain("OtraSecreta-1234");
      expect(dump).not.toMatch(/\$argon2/);
    });

    it("el log de auditoría no se puede modificar por API", async () => {
      expect((await as(base.admin).del("/api/audit")).status).toBe(404);
      expect((await as(base.admin).patch("/api/audit", {})).status).toBe(404);
    });
  });

  it("cabeceras de seguridad presentes y x-powered-by ausente", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });
});
