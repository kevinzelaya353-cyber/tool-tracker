import { randomUUID } from "node:crypto";
import { PrismaClient, type Role } from "@prisma/client";
import request from "supertest";
import { createApp } from "../../src/app.js";
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
export const app = createApp(env, { prisma, storage: storage.storage });

const tokens = new TokenService(
  { accessSecret: env.JWT_ACCESS_SECRET, refreshSecret: env.JWT_REFRESH_SECRET, accessTtlMin: 15, refreshTtlDays: 30 },
  prismaRefreshStore(prisma),
);

export const PASSWORD = "Prueba-12345";

/** Vacía todas las tablas. TRUNCATE no dispara el trigger de inmutabilidad (es por fila). */
export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE audit_log, refresh_tokens, photos, lifecycle_events, transfer_items, transfers,
             tools, tool_categories, vehicles, locations, users
    RESTART IDENTITY CASCADE`);
  storage.objects.clear();
}

let passwordHash: string | undefined;

export async function createUser(role: Role, overrides: { name?: string; email?: string; active?: boolean } = {}) {
  passwordHash ??= await hashPassword(PASSWORD); // un solo hash por proceso: argon2 es lento a propósito
  const user = await prisma.user.create({
    data: {
      name: overrides.name ?? `${role} ${randomUUID().slice(0, 4)}`,
      email: overrides.email ?? `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@test.local`,
      role,
      active: overrides.active ?? true,
      passwordHash,
    },
  });
  const pair = await tokens.issue({ userId: user.id, role });
  return { ...user, token: pair.accessToken, refreshToken: pair.refreshToken };
}

export type TestUser = Awaited<ReturnType<typeof createUser>>;

/** Cliente HTTP autenticado. */
export function as(user: TestUser | null) {
  const auth = (r: request.Test) => (user ? r.set("Authorization", `Bearer ${user.token}`) : r);
  return {
    get: (path: string) => auth(request(app).get(path)),
    post: (path: string, body?: object) => auth(request(app).post(path)).send(body ?? {}),
    patch: (path: string, body: object) => auth(request(app).patch(path)).send(body),
    del: (path: string) => auth(request(app).delete(path)),
    /** POST multipart: sin .send() previo, que supertest no permite mezclar con .attach(). */
    upload: (path: string) => auth(request(app).post(path)),
  };
}

/** Escenario base: una bodega, dos obras, una categoría, un vehículo y un usuario por rol. */
export async function seedBase() {
  const [admin, bodeguero, supervisor, lector, receptor] = await Promise.all([
    createUser("ADMIN", { name: "Admin" }),
    createUser("BODEGUERO", { name: "Bodeguero" }),
    createUser("SUPERVISOR", { name: "Supervisor" }),
    createUser("LECTOR", { name: "Lector" }),
    createUser("SUPERVISOR", { name: "Receptor" }),
  ]);
  const [bodega, obraA, obraB, category, vehicle] = await Promise.all([
    prisma.location.create({ data: { name: "Bodega principal", type: "BODEGA" } }),
    prisma.location.create({ data: { name: "Obra A", type: "PROYECTO" } }),
    prisma.location.create({ data: { name: "Obra B", type: "PROYECTO" } }),
    prisma.toolCategory.create({ data: { name: "Taladro" } }),
    prisma.vehicle.create({ data: { plate: "ABC-123" } }),
  ]);
  return { admin, bodeguero, supervisor, lector, receptor, bodega, obraA, obraB, category, vehicle };
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
    data: { id, storageKey: `photos/test/${id}.jpg`, thumbKey: `photos/test/${id}_thumb.jpg`, mime: "image/jpeg", sizeBytes: 1000, uploadedById: uploader.id },
  });
}

export const toolState = (id: string) =>
  prisma.tool.findUniqueOrThrow({
    where: { id },
    select: { status: true, currentLocationId: true, currentCustodianId: true },
  });

export const toolEvents = (id: string) =>
  prisma.lifecycleEvent.findMany({ where: { toolId: id }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] });
