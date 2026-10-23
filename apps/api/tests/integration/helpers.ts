import { randomUUID } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import request from "supertest";
import { createApp } from "../../src/app.js";
import type { RouteProvider } from "../../src/lib/routing.js";
import { hashPassword } from "../../src/modules/auth/auth.service.js";
import { prismaRefreshStore } from "../../src/modules/auth/refresh-store.prisma.js";
import { TokenService } from "../../src/modules/auth/token.service.js";
import type { ObjectStorage } from "../../src/modules/media/storage.js";
import { assertTestDatabase, TEST_DATABASE_URL } from "./test-db-url.js";

assertTestDatabase(TEST_DATABASE_URL);

export const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

const env = {
  NODE_ENV: "test" as const,
  CORS_ORIGINS: [],
  JWT_ACCESS_SECRET: "test-access-secret-".padEnd(48, "a"),
  JWT_REFRESH_SECRET: "test-refresh-secret-".padEnd(48, "r"),
  ACCESS_TTL_MIN: 15,
  REFRESH_TTL_DAYS: 30,
  MEDIA_URL_TTL_SEC: 600,
  MEDIA_ORPHAN_TTL_HOURS: 24,
  REPORTS_TZ: "UTC",
  TRUST_PROXY: 0,
};

/** Almacenamiento en memoria: permite inspeccionar lo que se "subió" sin MinIO. */
export function memoryStorage() {
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const storage: ObjectStorage = {
    put: async (key, body, contentType) => void objects.set(key, { body, contentType }),
    get: async (key) => {
      const o = objects.get(key);
      if (!o) throw new Error(`No existe ${key}`);
      return o.body;
    },
    remove: async (keys) => keys.forEach((k) => objects.delete(k)),
    signedUrl: async (key, ttl) => `https://storage.test/${key}?ttl=${ttl}`,
  };
  return { storage, objects };
}

export const storage = memoryStorage();
/** Ruta falsa (sin red): línea de 3 puntos y 1 km por cada 0.01° de diferencia en latitud. */
export const fakeRouting: RouteProvider = async (from, to) => ({
  geometry: [[from.lat, from.lng], [(from.lat + to.lat) / 2, (from.lng + to.lng) / 2], [to.lat, to.lng]],
  distanceM: Math.round(Math.abs(to.lat - from.lat) * 100_000),
  durationS: 600,
});
export const app = createApp(env, { prisma, storage: storage.storage, routing: fakeRouting });

export const tokens = new TokenService(
  { accessSecret: env.JWT_ACCESS_SECRET, refreshSecret: env.JWT_REFRESH_SECRET, accessTtlMin: 15, refreshTtlDays: 30 },
  prismaRefreshStore(prisma),
);

export const PASSWORD = "Prueba-12345";

/** Vacía todas las tablas. TRUNCATE no dispara los triggers de inmutabilidad (son por fila). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_log, impersonation_sessions, refresh_tokens, photos, damage_reports, rentals, lifecycle_events,
             transfer_items, transfers, tools, tool_categories, vehicles, locations, users, organizations
    RESTART IDENTITY CASCADE`);
  storage.objects.clear();
  defaultOrgId = undefined;
}

/** Organización a la que van los usuarios creados sin indicar otra (la primera de seedBase). */
let defaultOrgId: string | undefined;

export async function createOrg(name: string, overrides: { active?: boolean; currency?: string } = {}) {
  return prisma.organization.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${randomUUID().slice(0, 6)}`,
      active: overrides.active ?? true,
      currency: overrides.currency ?? "HNL",
    },
  });
}

async function defaultOrg() {
  defaultOrgId ??= (await createOrg("Organización de pruebas")).id;
  return defaultOrgId;
}

let passwordHash: string | undefined;

export async function createUser(
  role: Role,
  overrides: { name?: string; email?: string; username?: string; active?: boolean; organizationId?: string } = {},
) {
  passwordHash ??= await hashPassword(PASSWORD); // un solo hash por proceso: argon2 es lento a propósito
  // El SuperAdmin no pertenece a ninguna organización; el resto, a la indicada o a la de pruebas.
  const organizationId = role === "SUPERADMIN" ? null : (overrides.organizationId ?? (await defaultOrg()));
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${randomUUID().slice(0, 4)}`,
      email: overrides.email ?? `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`,
      username: overrides.username ?? `${role.toLowerCase()}-${randomUUID().slice(0, 8)}`,
      role,
      active: overrides.active ?? true,
      organizationId,
      passwordHash,
    },
  });
  const pair = await tokens.issue({ userId: user.id, role, orgId: organizationId });
  // Los usuarios de prueba siempre tienen correo y usuario (las personas sin acceso no los tienen).
  return { ...user, email: user.email!, username: user.username!, token: pair.accessToken, refreshToken: pair.refreshToken };
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

/**
 * Cliente HTTP autenticado. `orgId` envía X-Org-Id (la organización en la que opera un SuperAdmin;
 * para el resto, un intento de cambiar de organización). Acepta un token suelto (sesiones de soporte).
 */
export function as(user: { token: string } | null, opts: { orgId?: string } = {}) {
  const auth = (r: request.Test) => {
    if (user) r.set("Authorization", `Bearer ${user.token}`);
    if (opts.orgId) r.set("X-Org-Id", opts.orgId);
    return r;
  };
  return {
    get: (path: string) => auth(request(app).get(path)),
    post: (path: string, body?: object) => auth(request(app).post(path)).send(body ?? {}),
    put: (path: string, body: object) => auth(request(app).put(path)).send(body),
    patch: (path: string, body: object) => auth(request(app).patch(path)).send(body),
    del: (path: string) => auth(request(app).delete(path)),
    /** POST multipart: sin .send() previo, que supertest no permite mezclar con .attach(). */
    upload: (path: string) => auth(request(app).post(path)),
  };
}

/**
 * Escenario base de una organización: una bodega, dos obras, una categoría, un vehículo y un
 * usuario por rol. La primera organización sembrada pasa a ser la de pruebas por defecto.
 */
export async function seedBase(orgName = "Empresa A") {
  const org = await createOrg(orgName);
  defaultOrgId ??= org.id;
  const organizationId = org.id;
  const [admin, bodeguero, supervisor, lector, receptor] = await Promise.all([
    createUser("ADMIN", { name: "Admin", organizationId }),
    createUser("BODEGUERO", { name: "Bodeguero", organizationId }),
    createUser("SUPERVISOR", { name: "Supervisor", organizationId }),
    createUser("LECTOR", { name: "Lector", organizationId }),
    createUser("SUPERVISOR", { name: "Receptor", organizationId }),
  ]);
  const [bodega, obraA, obraB, category, vehicle] = await Promise.all([
    prisma.location.create({ data: { organizationId, name: "Bodega principal", type: "BODEGA" } }),
    prisma.location.create({ data: { organizationId, name: "Obra A", type: "PROYECTO" } }),
    prisma.location.create({ data: { organizationId, name: "Obra B", type: "PROYECTO" } }),
    prisma.toolCategory.create({ data: { organizationId, name: "Taladro" } }),
    prisma.vehicle.create({ data: { organizationId, plate: "ABC-123" } }),
  ]);
  return { org, admin, bodeguero, supervisor, lector, receptor, bodega, obraA, obraB, category, vehicle };
}

export type Base = Awaited<ReturnType<typeof seedBase>>;

let toolSeq = 0;

/** Alta por la API (crea también el evento PURCHASE). */
export async function createTool(
  base: Base,
  overrides: Partial<{ code: string; purchasePrice: string; purchaseDate: string; categoryId: string }> = {},
) {
  const res = await as(base.bodeguero).post("/api/tools", {
    code: overrides.code ?? `TAL-${String(++toolSeq).padStart(4, "0")}`,
    categoryId: overrides.categoryId ?? base.category.id,
    brand: "Makita",
    purchasePrice: overrides.purchasePrice ?? "100.00",
    purchaseDate: overrides.purchaseDate ?? "2025-01-10",
    initialLocationId: base.bodega.id,
  });
  if (res.status !== 201) throw new Error(`createTool falló: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; code: string };
}

/** Payload de traslado con valores por defecto válidos. */
export function transferBody(base: Base, toolIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    fromLocationId: base.bodega.id,
    toLocationId: base.obraA.id,
    deliveredById: base.bodeguero.id,
    receivedById: base.receptor.id,
    vehicleId: base.vehicle.id,
    movedAt: "2025-02-01T08:00:00Z",
    items: toolIds.map((toolId) => ({ toolId })),
    ...overrides,
  };
}

/** Registra una foto "subida" por el usuario sin pasar por sharp (para pruebas de asociación). */
export async function fakePhoto(uploader: TestUser) {
  const id = randomUUID();
  return prisma.photo.create({
    data: {
      id,
      organizationId: uploader.organizationId!,
      storageKey: `photos/test/${id}.jpg`,
      thumbKey: `photos/test/${id}_thumb.jpg`,
      mime: "image/jpeg",
      sizeBytes: 1000,
      uploadedById: uploader.id,
    },
  });
}

export const toolState = (id: string) =>
  prisma.tool.findUniqueOrThrow({
    where: { id },
    select: { status: true, currentLocationId: true, currentCustodianId: true },
  });

export const toolEvents = (id: string) =>
  prisma.lifecycleEvent.findMany({ where: { toolId: id }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] });
