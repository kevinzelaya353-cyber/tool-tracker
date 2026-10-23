import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as,
  createTool,
  createUser,
  PASSWORD,
  prisma,
  resetDb,
  seedBase,
  tokens,
  type Base,
  type TestUser,
} from "./helpers.js";

const login = (username: string, password: string) => as(null).post("/api/auth/login", { username, password });

describe("SuperAdmin y plataforma (integración)", () => {
  let A: Base;
  let B: Base;
  let superadmin: TestUser;

  beforeAll(async () => {
    await resetDb();
    A = await seedBase("Empresa A");
    B = await seedBase("Empresa B");
    superadmin = await createUser("SUPERADMIN", { name: "Soporte" });
    await createTool(A, { purchasePrice: "100.00" });
    await createTool(B, { purchasePrice: "200.00" });
    await createTool(B, { purchasePrice: "300.00" });
  });

  afterAll(() => prisma.$disconnect());

  it("14. ve todas las organizaciones y el tablero global por empresa", async () => {
    const orgs = await as(superadmin).get("/api/platform/organizations");
    expect(orgs.status).toBe(200);
    expect(orgs.body.map((o: { name: string }) => o.name)).toEqual(["Empresa A", "Empresa B"]);
    expect(orgs.body.find((o: { name: string }) => o.name === "Empresa B")).toMatchObject({ tools: 2 });

    const overview = await as(superadmin).get("/api/platform/overview");
    expect(overview.body).toMatchObject({ organizations: 2, activeOrganizations: 2, tools: 3, superadmins: 1 });
    const b = overview.body.byOrganization.find((o: { name: string }) => o.name === "Empresa B");
    expect(b).toMatchObject({ tools: 2, users: 5, purchases: { count: 2, value: "500.00" } });
    expect(b.byStatus.BODEGA).toBe(2);
  });

  it("10.4 sin organización elegida no toca datos operativos; con X-Org-Id opera en esa empresa", async () => {
    const none = await as(superadmin).get("/api/tools");
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("ORG_REQUIRED");

    expect((await as(superadmin, { orgId: A.org.id }).get("/api/tools")).body.total).toBe(1);
    expect((await as(superadmin, { orgId: B.org.id }).get("/api/tools")).body.total).toBe(2);

    // Alta operativa en B: queda en B y auditada con el SuperAdmin y la organización en que se hizo.
    const created = await as(superadmin, { orgId: B.org.id }).post("/api/tools", {
      code: "SUP-0001",
      categoryId: B.category.id,
      brand: "Bosch",
      purchasePrice: "10.00",
      purchaseDate: "2025-01-10",
      initialLocationId: B.bodega.id,
    });
    expect(created.status).toBe(201);
    expect((await prisma.tool.findUniqueOrThrow({ where: { id: created.body.id } })).organizationId).toBe(B.org.id);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "tool.create", entityId: created.body.id } });
    expect(log).toMatchObject({ actorId: superadmin.id, effectiveUserId: superadmin.id, organizationId: B.org.id });
    // Con la categoría de A dentro de B: no existe.
    const mixed = await as(superadmin, { orgId: B.org.id }).post("/api/tools", {
      code: "SUP-0002",
      categoryId: A.category.id,
      brand: "Bosch",
      purchasePrice: "10.00",
      purchaseDate: "2025-01-10",
      initialLocationId: B.bodega.id,
    });
    expect(mixed.status).toBe(400);
  });

  it("15. crea una organización con su primer administrador, que debe cambiar la contraseña al entrar", async () => {
    const res = await as(superadmin).post("/api/platform/organizations", {
      name: "Constructora Ñandú",
      currency: "usd",
      admin: { name: "Gerente", username: "gerente-nandu", password: "Inicial-2025-x" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ slug: "constructora-nandu", currency: "USD" });
    const orgId = res.body.id;
    expect(await prisma.toolCategory.count({ where: { organizationId: orgId } })).toBeGreaterThan(20);
    expect(await prisma.location.count({ where: { organizationId: orgId, type: "BODEGA" } })).toBe(1);

    const first = await login("gerente-nandu", "Inicial-2025-x");
    expect(first.status).toBe(200);
    expect(first.body.user).toMatchObject({ role: "ADMIN", mustChangePassword: true, organization: { id: orgId, currency: "USD" } });
    const blocked = await as({ token: first.body.accessToken }).get("/api/tools");
    expect(blocked.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await as({ token: first.body.accessToken }).post("/api/auth/change-password", {
      currentPassword: "Inicial-2025-x",
      newPassword: "Propia-2025-segura",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);
    expect((await as({ token: changed.body.accessToken }).get("/api/tools")).status).toBe(200);
    expect((await login("gerente-nandu", "Inicial-2025-x")).status).toBe(401);

    // Nombre duplicado → identificador distinto; identificador repetido → 409.
    const again = await as(superadmin).post("/api/platform/organizations", { name: "Constructora Ñandú" });
    expect(again.body.slug).toBe("constructora-nandu-2");
    expect((await as(superadmin).post("/api/platform/organizations", { name: "X", slug: "constructora-nandu" })).status).toBe(409);
  });

  it("15. administra usuarios de cualquier organización con las reglas de esa organización", async () => {
    const list = await as(superadmin).get(`/api/platform/users?organizationId=${A.org.id}`);
    expect(list.body.total).toBe(5);
    expect(list.body.data.every((u: { organization: { id: string } }) => u.organization.id === A.org.id)).toBe(true);

    const created = await as(superadmin).post("/api/platform/users", {
      organizationId: A.org.id,
      name: "Nuevo bodeguero",
      username: "nuevo-bodeguero-a",
      password: "4826",
      role: "BODEGUERO",
    });
    expect(created.status).toBe(201);
    expect(created.body.organization.id).toBe(A.org.id);

    // Último administrador de A: ni el SuperAdmin lo deja sin administradores.
    const lastAdmin = await as(superadmin).patch(`/api/platform/users/${A.admin.id}`, { active: false });
    expect(lastAdmin.body.error.code).toBe("LAST_ADMIN");
  });

  it("20. restablece contraseñas (sin poder verlas) y obliga a cambiarlas; revoca sesiones", async () => {
    const target = await createUser("SUPERVISOR", { organizationId: A.org.id });
    const reset = await as(superadmin).post(`/api/platform/users/${target.id}/reset-password`, { password: "5937" });
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ mustChangePassword: true, activeSessions: 0 });
    expect(reset.body).not.toHaveProperty("passwordHash");
    // La sesión anterior ya no se renueva.
    expect((await as(null).post("/api/auth/refresh", { refreshToken: target.refreshToken })).status).toBe(401);
    expect((await login(target.username, PASSWORD)).status).toBe(401);
    const fresh = await login(target.username, "5937");
    expect(fresh.body.user.mustChangePassword).toBe(true);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "user.password_reset", entityId: target.id } });
    expect(JSON.stringify(audit.diff)).not.toContain("5937");
    expect(audit.organizationId).toBe(A.org.id);

    // El administrador de la organización puede hacer lo mismo con los suyos; revocar sesiones.
    const other = await createUser("LECTOR", { organizationId: A.org.id });
    expect((await as(A.admin).post(`/api/users/${other.id}/revoke-sessions`)).status).toBe(200);
    expect((await as(null).post("/api/auth/refresh", { refreshToken: other.refreshToken })).status).toBe(401);
    // Bloquear y desbloquear.
    expect((await as(A.admin).patch(`/api/users/${other.id}`, { lock: true })).body.lockedAt).toBeTruthy();
    expect((await login(other.username, PASSWORD)).status).toBe(423);
    expect((await as(A.admin).patch(`/api/users/${other.id}`, { unlock: true })).body.lockedAt).toBeNull();
    expect((await login(other.username, PASSWORD)).status).toBe(200);
  });

  it("controles reforzados: crear SuperAdmins exige la contraseña; nunca queda la plataforma sin SuperAdmin", async () => {
    const body = { name: "Otro soporte", username: "soporte-2", password: "Otro-soporte-2025", role: "SUPERADMIN" };
    expect((await as(superadmin).post("/api/platform/users", body)).status).toBe(403);
    expect((await as(superadmin).post("/api/platform/users", { ...body, confirmPassword: "mal" })).status).toBe(403);
    expect((await as(superadmin).post("/api/platform/users", { ...body, organizationId: A.org.id, confirmPassword: PASSWORD })).status).toBe(400);
    const second = await as(superadmin).post("/api/platform/users", { ...body, confirmPassword: PASSWORD });
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ role: "SUPERADMIN", organizationId: null, mustChangePassword: true });

    expect((await as(superadmin).patch(`/api/platform/users/${superadmin.id}`, { active: false, confirmPassword: PASSWORD })).body.error.code).toBe(
      "SELF_LOCKOUT",
    );
    expect((await as(superadmin).patch(`/api/platform/users/${second.body.id}`, { active: false })).status).toBe(400); // sin confirmación
    expect((await as(superadmin).patch(`/api/platform/users/${second.body.id}`, { active: false, confirmPassword: PASSWORD })).status).toBe(200);
    // Queda uno solo activo: desactivarlo (desde otra cuenta ya inactiva no se puede, y a sí mismo tampoco).
    const third = await createUser("SUPERADMIN");
    await prisma.user.update({ where: { id: third.id }, data: { active: true } });
    await prisma.user.update({ where: { id: superadmin.id }, data: { active: false } });
    const last = await as(third).patch(`/api/platform/users/${superadmin.id}`, { active: true, confirmPassword: PASSWORD });
    expect(last.status).toBe(200);
    const lastOne = await as(superadmin).patch(`/api/platform/users/${third.id}`, { active: false, confirmPassword: PASSWORD });
    expect(lastOne.status).toBe(200);
    await prisma.user.update({ where: { id: third.id }, data: { active: true } });
    await prisma.user.update({ where: { id: second.body.id }, data: { active: false } });
    await prisma.user.update({ where: { id: third.id }, data: { active: false } });
    const nobodyElse = await as(third).patch(`/api/platform/users/${superadmin.id}`, { active: false, confirmPassword: PASSWORD });
    expect(nobodyElse.body.error.code).toBe("LAST_SUPERADMIN");
  });

  it("21. sin escalamiento: un administrador no llega a la plataforma ni crea SuperAdmins", async () => {
    for (const path of ["/api/platform/overview", "/api/platform/users", "/api/platform/audit", "/api/platform/impersonations"]) {
      expect((await as(A.admin).get(path)).status).toBe(403);
    }
    expect((await as(A.admin).post("/api/platform/users", { role: "SUPERADMIN" })).status).toBe(403);
    expect((await as(A.admin).patch(`/api/platform/organizations/${A.org.id}`, { active: false })).status).toBe(403);
    const denied = await prisma.auditLog.count({ where: { action: "access.denied", actorId: A.admin.id } });
    expect(denied).toBeGreaterThanOrEqual(6);
  });

  it("auditoría global con filtros por empresa, usuario, acción, módulo, resultado y fecha", async () => {
    const all = await as(superadmin).get("/api/platform/audit?pageSize=100");
    expect(new Set(all.body.data.map((r: { organizationId: string | null }) => r.organizationId)).size).toBeGreaterThan(1);
    const onlyB = await as(superadmin).get(`/api/platform/audit?organizationId=${B.org.id}&module=tool`);
    expect(onlyB.body.total).toBeGreaterThan(0);
    expect(onlyB.body.data.every((r: { organizationId: string; action: string }) => r.organizationId === B.org.id && r.action.startsWith("tool."))).toBe(
      true,
    );
    const denied = await as(superadmin).get("/api/platform/audit?result=DENIED");
    expect(denied.body.data.every((r: { result: string }) => r.result === "DENIED")).toBe(true);
    const future = await as(superadmin).get(`/api/platform/audit?from=${new Date(Date.now() + 86_400_000).toISOString()}`);
    expect(future.body.total).toBe(0);
    const byUser = await as(superadmin).get(`/api/platform/audit?userId=${superadmin.id}`);
    expect(byUser.body.data.length).toBeGreaterThan(0);
  });
});

describe("Sesión de soporte (impersonación) (integración)", () => {
  let A: Base;
  let B: Base;
  let superadmin: TestUser;

  beforeAll(async () => {
    await resetDb();
    A = await seedBase("Empresa A");
    B = await seedBase("Empresa B");
    superadmin = await createUser("SUPERADMIN", { name: "Soporte" });
    await createTool(A);
    await createTool(B);
  });

  afterAll(() => prisma.$disconnect());

  const start = (userId: string, who: { token: string } = superadmin) =>
    as(who).post("/api/platform/impersonations", { userId, reason: "Revisar un traslado reportado" });

  it("16-17. accede como un usuario con SUS permisos y solo SU organización, sin tocar su contraseña", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: A.bodeguero.id }, select: { passwordHash: true } });
    const res = await start(A.bodeguero.id);
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("refreshToken");
    expect(res.body.user).toMatchObject({ id: A.bodeguero.id, role: "BODEGUERO", impersonation: { actor: { id: superadmin.id } } });
    const imp = { token: res.body.accessToken as string };

    const me = await as(imp).get("/api/auth/me");
    expect(me.body).toMatchObject({ id: A.bodeguero.id, impersonation: { actor: { name: "Soporte" } } });
    expect((await as(imp).get("/api/tools")).body.total).toBe(1); // solo A
    expect((await as(imp, { orgId: B.org.id }).get("/api/tools")).status).toBe(403);
    expect((await as(imp).get("/api/users/" + A.lector.id)).status).toBe(403); // un bodeguero no gestiona usuarios
    expect((await as(imp).get("/api/reports/spend-by-category")).status).toBe(403); // ni ve montos
    expect((await as(imp).get("/api/platform/overview")).status).toBe(403); // ni es SuperAdmin

    const after = await prisma.user.findUniqueOrThrow({ where: { id: A.bodeguero.id }, select: { passwordHash: true } });
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it("19. lo que hace en la sesión queda auditado con el actor real y el usuario efectivo", async () => {
    const res = await start(A.bodeguero.id);
    const imp = { token: res.body.accessToken as string };
    const created = await as(imp).post("/api/vehicles", { plate: "SOP-001" });
    expect(created.status).toBe(201);
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "vehicle.create", entityId: created.body.id } });
    expect(log).toMatchObject({
      actorId: superadmin.id,
      effectiveUserId: A.bodeguero.id,
      impersonationId: res.body.session.id,
      organizationId: A.org.id,
    });
    const started = await prisma.auditLog.findFirstOrThrow({ where: { action: "impersonation.start", impersonationId: null, entityId: A.bodeguero.id } });
    expect(started).toMatchObject({ actorId: superadmin.id, organizationId: A.org.id });
  });

  it("operaciones sensibles bloqueadas durante la sesión de soporte", async () => {
    const res = await start(A.admin.id);
    const imp = { token: res.body.accessToken as string };
    expect((await as(imp).get("/api/users?includeInactive=true")).status).toBe(200); // consultar sí
    const create = await as(imp).post("/api/users", { name: "X", username: "x-imp", password: "4826", role: "LECTOR" });
    expect(create.body.error.code).toBe("IMPERSONATION_FORBIDDEN");
    expect((await as(imp).post(`/api/users/${A.lector.id}/reset-password`, { password: "4826" })).body.error.code).toBe("IMPERSONATION_FORBIDDEN");
    expect((await as(imp).post("/api/auth/change-password", { currentPassword: "x", newPassword: "y" })).status).toBe(403);
  });

  it("18. finalizar la sesión invalida su token al instante", async () => {
    const res = await start(A.supervisor.id);
    const imp = { token: res.body.accessToken as string };
    expect((await as(imp).post("/api/auth/impersonation/end")).status).toBe(204);
    const after = await as(imp).get("/api/tools");
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe("IMPERSONATION_ENDED");
    expect(await prisma.auditLog.count({ where: { action: "impersonation.end", entityId: A.supervisor.id } })).toBe(1);
    // La sesión del SuperAdmin sigue intacta.
    expect((await as(superadmin).get("/api/platform/overview")).status).toBe(200);
  });

  it("revocar desde la plataforma; una sola sesión a la vez; las vencidas no sirven", async () => {
    const first = await start(A.lector.id);
    const second = await start(B.lector.id);
    // Abrir otra cierra la anterior.
    expect((await as({ token: first.body.accessToken }).get("/api/tools")).status).toBe(401);
    const active = await as(superadmin).get("/api/platform/impersonations?active=true");
    expect(active.body.data.map((s: { id: string }) => s.id)).toEqual([second.body.session.id]);
    expect((await as(superadmin).post(`/api/platform/impersonations/${second.body.session.id}/revoke`)).status).toBe(204);
    expect((await as({ token: second.body.accessToken }).get("/api/tools")).status).toBe(401);

    // Sesión vencida (aunque el token siguiera siendo válido).
    const id = randomUUID();
    await prisma.impersonationSession.create({
      data: {
        id,
        actorId: superadmin.id,
        targetUserId: A.lector.id,
        organizationId: A.org.id,
        reason: "vencida",
        startedAt: new Date(Date.now() - 2 * 3_600_000),
        expiresAt: new Date(Date.now() - 3_600_000),
      },
    });
    const stale = await tokens.signAccess({ userId: A.lector.id, role: "LECTOR", orgId: A.org.id, actorId: superadmin.id, impersonationId: id }, 600);
    expect((await as({ token: stale }).get("/api/tools")).status).toBe(401);
  });

  it("sin cadenas ni atajos: solo un SuperAdmin, nunca hacia otro SuperAdmin ni desde una sesión de soporte", async () => {
    expect((await start(A.lector.id, A.admin)).status).toBe(403);
    const other = await createUser("SUPERADMIN");
    expect((await start(other.id)).status).toBe(403);
    const inactive = await createUser("LECTOR", { organizationId: A.org.id, active: false });
    expect((await start(inactive.id)).body.error.code).toBe("USER_INACTIVE");
    const res = await start(A.admin.id);
    const chained = await start(A.lector.id, { token: res.body.accessToken });
    expect(chained.status).toBe(403);
    expect((await as(superadmin).post("/api/platform/impersonations", { userId: A.lector.id, reason: "" })).status).toBe(400);
    // La base de datos tampoco acepta una sesión abierta por alguien que no es SuperAdmin.
    await expect(
      prisma.impersonationSession.create({
        data: { actorId: A.admin.id, targetUserId: A.lector.id, organizationId: A.org.id, reason: "x", expiresAt: new Date(Date.now() + 60_000) },
      }),
    ).rejects.toThrow(/TENANT_MISMATCH/);
  });
});
