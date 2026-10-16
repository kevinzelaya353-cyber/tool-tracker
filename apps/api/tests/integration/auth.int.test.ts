import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app, as, createUser, PASSWORD, prisma, resetDb } from "./helpers.js";

const login = (email: string, password = PASSWORD) => request(app).post("/api/auth/login").send({ email, password });
const refresh = (refreshToken: string) => request(app).post("/api/auth/refresh").send({ refreshToken });

describe("auth (integración)", () => {
  beforeEach(resetDb);
  afterAll(() => prisma.$disconnect());

  it("login correcto devuelve tokens, usuario con permisos y deja auditoría", async () => {
    const u = await createUser("BODEGUERO");
    const res = await login(u.email);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ id: u.id, role: "BODEGUERO" });
    expect(res.body.user.permissions).toContain("transfers:create");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(await prisma.auditLog.count({ where: { action: "auth.login", actorId: u.id } })).toBe(1);
  });

  it("contraseña incorrecta, correo inexistente y usuario inactivo responden igual", async () => {
    const u = await createUser("BODEGUERO");
    const inactive = await createUser("BODEGUERO", { active: false });
    const responses = await Promise.all([login(u.email, "incorrecta-123"), login("nadie@test.local"), login(inactive.email)]);
    for (const r of responses) {
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe("Credenciales inválidas");
    }
    expect(await prisma.auditLog.count({ where: { action: "auth.login_failed" } })).toBe(3);
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
