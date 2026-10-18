import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, as, createUser, PASSWORD, prisma, resetDb } from "./helpers.js";

const login = (username: string, password = PASSWORD) => request(app).post("/api/auth/login").send({ username, password });
const refresh = (refreshToken: string) => request(app).post("/api/auth/refresh").send({ refreshToken });

describe("auth (integración)", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("login correcto devuelve tokens, usuario con permisos y deja auditoría", async () => {
    const u = await createUser("BODEGUERO");
    const res = await login(u.username.toUpperCase()); // el usuario no distingue mayúsculas
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ id: u.id, role: "BODEGUERO" });
    expect(res.body.user.permissions).toContain("transfers:create");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(await prisma.auditLog.count({ where: { action: "auth.login", actorId: u.id } })).toBe(1);
  });

  it("las cuentas antiguas siguen entrando con su correo", async () => {
    const u = await createUser("ADMIN");
    expect((await login(u.email)).status).toBe(200);
  });

  it("PIN incorrecto, usuario inexistente y usuario inactivo responden igual", async () => {
    const u = await createUser("BODEGUERO");
    const inactive = await createUser("BODEGUERO", { active: false });
    const responses = await Promise.all([login(u.username, "9999"), login("nadie"), login(inactive.username)]);
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe("Usuario o PIN incorrecto");
    }
    expect(await prisma.auditLog.count({ where: { action: "auth.login_failed" } })).toBe(3);
  });

  it("el administrador crea usuarios con PIN y entran con usuario + PIN", async () => {
    const admin = await createUser("ADMIN");
    const res = await as(admin).post("/api/users", { name: "Mario", username: "Mario", password: "4829", role: "SUPERVISOR" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ username: "mario", lockedAt: null });
    expect((await login("mario", "4829")).status).toBe(200);
    // PIN débil o contraseña de admin para un rol de campo: rechazados.
    expect((await as(admin).post("/api/users", { name: "Ana", username: "ana", password: "1234", role: "LECTOR" })).status).toBe(400);
    expect((await as(admin).post("/api/users", { name: "Ana", username: "ana", password: "4829", role: "ADMIN" })).status).toBe(400);
    // Usuario repetido.
    expect((await as(admin).post("/api/users", { name: "Otro", username: "mario", password: "5830", role: "LECTOR" })).status).toBe(409);
  });

  it("5 PIN incorrectos bloquean la cuenta hasta que el administrador la desbloquea", async () => {
    const admin = await createUser("ADMIN");
    const u = await createUser("SUPERVISOR");
    for (let i = 0; i < 4; i++) expect((await login(u.username, "0007")).status).toBe(401);
    const fifth = await login(u.username, "0007");
    expect(fifth.status).toBe(423);
    expect(fifth.body.error.code).toBe("ACCOUNT_LOCKED");
    // Ni con el PIN correcto.
    expect((await login(u.username)).status).toBe(423);

    expect((await as(admin).patch(`/api/users/${u.id}`, { unlock: true })).body.lockedAt).toBeNull();
    expect((await login(u.username)).status).toBe(200);
  });

  it("un acierto reinicia el contador de intentos", async () => {
    const u = await createUser("SUPERVISOR");
    for (let i = 0; i < 4; i++) await login(u.username, "0007");
    expect((await login(u.username)).status).toBe(200);
    for (let i = 0; i < 4; i++) await login(u.username, "0007");
    expect((await login(u.username)).status).toBe(200);
  });

  it("el administrador no se bloquea por intentos (lo frena el límite de peticiones)", async () => {
    const admin = await createUser("ADMIN");
    for (let i = 0; i < 5; i++) await login(admin.username, "incorrecta-123");
    expect((await login(admin.username)).status).toBe(200);
  });

  it("dar acceso a una persona registrada sin cuenta exige usuario y PIN", async () => {
    const admin = await createUser("ADMIN");
    const person = await prisma.user.create({ data: { name: "Juan", role: "LECTOR" } });
    expect((await as(admin).patch(`/api/users/${person.id}`, { password: "4829" })).body.error.code).toBe("USERNAME_REQUIRED");
    expect((await as(admin).patch(`/api/users/${person.id}`, { username: "juan" })).body.error.code).toBe("CREDENTIAL_REQUIRED");
    expect((await as(admin).patch(`/api/users/${person.id}`, { username: "juan", password: "4829" })).status).toBe(200);
    expect((await login("juan", "4829")).status).toBe(200);
  });

  it("refresh rota el token: el anterior deja de servir", async () => {
    const u = await createUser("LECTOR");
    const first = await refresh(u.refreshToken);
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(u.refreshToken);
    expect((await refresh(first.body.refreshToken)).status).toBe(200);
  });

  it("reutilizar un refresh token revoca toda la sesión y se audita", async () => {
    const u = await createUser("LECTOR");
    const rotated = await refresh(u.refreshToken);
    const reuse = await refresh(u.refreshToken); // atacante con el token viejo
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe("REFRESH_REUSED");
    expect((await refresh(rotated.body.refreshToken)).status).toBe(401); // la sesión legítima también cae
    // Se audita cada intento con un token revocado (el del atacante y el posterior de la sesión legítima).
    expect(await prisma.auditLog.count({ where: { action: "auth.refresh_reuse_detected" } })).toBeGreaterThanOrEqual(1);
  });

  it("dos refresh simultáneos con el mismo token: como máximo uno gana", async () => {
    const u = await createUser("LECTOR");
    const [a, b] = await Promise.all([refresh(u.refreshToken), refresh(u.refreshToken)]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeLessThanOrEqual(1);
  });

  it("logout revoca el refresh token", async () => {
    const u = await createUser("LECTOR");
    expect((await request(app).post("/api/auth/logout").send({ refreshToken: u.refreshToken })).status).toBe(204);
    expect((await refresh(u.refreshToken)).status).toBe(401);
  });

  it("desactivar a un usuario cierra sus sesiones", async () => {
    const admin = await createUser("ADMIN");
    const u = await createUser("BODEGUERO");
    expect((await as(admin).patch(`/api/users/${u.id}`, { active: false })).status).toBe(200);
    expect((await refresh(u.refreshToken)).status).toBe(401);
  });

  it("GET /me con token válido devuelve el usuario; sin token, 401", async () => {
    const u = await createUser("SUPERVISOR");
    expect((await as(u).get("/api/auth/me")).body.id).toBe(u.id);
    expect((await as(null).get("/api/auth/me")).status).toBe(401);
  });
});
