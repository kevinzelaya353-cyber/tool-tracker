import type { PrismaClient } from "@prisma/client";
import type {
  CatalogListQuery,
  CategoryCreateInput,
  LocationCreateInput,
  LocationUpdateInput,
  VehicleCreateInput,
  VehicleUpdateInput,
} from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";

type Ctx = { actorId: string; ip?: string };

export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------- Categorías ----------

  listCategories() {
    return this.prisma.toolCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { tools: true } } },
    });
  }

  async createCategory(input: CategoryCreateInput, ctx: Ctx) {
    const c = await this.prisma.toolCategory.create({ data: input });
    await audit(this.prisma, { actorId: ctx.actorId, action: "category.create", entity: "category", entityId: c.id, diff: input, ip: ctx.ip });
    return c;
  }

  async renameCategory(id: string, input: Partial<CategoryCreateInput>, ctx: Ctx) {
    const c = await this.prisma.toolCategory.update({ where: { id }, data: input });
    await audit(this.prisma, { actorId: ctx.actorId, action: "category.update", entity: "category", entityId: id, diff: input, ip: ctx.ip });
    return c;
  }

  // ---------- Ubicaciones (bodegas y proyectos) ----------

  listLocations(q: CatalogListQuery) {
    return this.prisma.location.findMany({
      where: { type: q.type, ...(q.includeInactive === "true" ? {} : { active: true }) },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { _count: { select: { tools: true } } },
    });
  }

  async createLocation(input: LocationCreateInput, ctx: Ctx) {
    const l = await this.prisma.location.create({ data: input });
    await audit(this.prisma, { actorId: ctx.actorId, action: "location.create", entity: "location", entityId: l.id, diff: input, ip: ctx.ip });
    return l;
  }

  async updateLocation(id: string, input: LocationUpdateInput, ctx: Ctx) {
    return this.prisma.$transaction(async (tx) => {
      // Bloqueo exclusivo: los traslados toman FOR SHARE sobre origen/destino,
      // así no puede entrar una herramienta mientras se cierra la ubicación.
      await tx.$queryRaw`SELECT id FROM locations WHERE id = ${id}::uuid FOR UPDATE`;
      const before = await tx.location.findUnique({ where: { id } });
      if (!before) throw AppError.notFound("Ubicación");

      // No se puede cerrar un proyecto/bodega que todavía tiene herramientas asignadas.
      if (input.active === false && before.active) {
        const count = await tx.tool.count({
          where: { currentLocationId: id, status: { in: ["BODEGA", "EN_PROYECTO"] } },
        });
        if (count > 0) {
          throw AppError.conflict("LOCATION_NOT_EMPTY", `La ubicación aún tiene ${count} herramienta(s) asignada(s)`, { count });
        }
      }

      const closedAt = input.active === false && input.closedAt === undefined ? new Date() : input.closedAt;
      const after = await tx.location.update({ where: { id }, data: { ...input, closedAt } });
      await audit(tx, { actorId: ctx.actorId, action: "location.update", entity: "location", entityId: id, diff: input, ip: ctx.ip });
      return after;
    });
  }

  // ---------- Vehículos ----------

  listVehicles(q: CatalogListQuery) {
    return this.prisma.vehicle.findMany({
      where: q.includeInactive === "true" ? {} : { active: true },
      orderBy: { plate: "asc" },
    });
  }

  async createVehicle(input: VehicleCreateInput, ctx: Ctx) {
    const v = await this.prisma.vehicle.create({ data: input });
    await audit(this.prisma, { actorId: ctx.actorId, action: "vehicle.create", entity: "vehicle", entityId: v.id, diff: input, ip: ctx.ip });
    return v;
  }

  async updateVehicle(id: string, input: VehicleUpdateInput, ctx: Ctx) {
    const v = await this.prisma.vehicle.update({ where: { id }, data: input });
    await audit(this.prisma, { actorId: ctx.actorId, action: "vehicle.update", entity: "vehicle", entityId: id, diff: input, ip: ctx.ip });
    return v;
  }
}
