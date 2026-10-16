import type { Prisma, PrismaClient } from "@prisma/client";
import { availableEvents, type ToolCreateInput, type ToolListQuery, type ToolUpdateInput } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/pagination.js";

type Ctx = { actorId: string; ip?: string };

const LIST_INCLUDE = {
  category: { select: { id: true, name: true } },
  currentLocation: { select: { id: true, name: true, type: true } },
  currentCustodian: { select: { id: true, name: true } },
} satisfies Prisma.ToolInclude;

export class ToolsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(q: ToolListQuery) {
    const where: Prisma.ToolWhereInput = {
      status: q.status,
      categoryId: q.categoryId,
      currentLocationId: q.locationId,
      ...(q.q && {
        OR: [
          { code: { contains: q.q, mode: "insensitive" } },
          { brand: { contains: q.q, mode: "insensitive" } },
          { model: { contains: q.q, mode: "insensitive" } },
          { serial: { contains: q.q, mode: "insensitive" } },
        ],
      }),
    };
    const [total, data] = await Promise.all([
      this.prisma.tool.count({ where }),
      this.prisma.tool.findMany({ where, include: LIST_INCLUDE, orderBy: { code: "asc" }, ...pageArgs(q) }),
    ]);
    return toPage(data, total, q);
  }

  async get(id: string) {
    const tool = await this.prisma.tool.findUnique({
      where: { id },
      include: { ...LIST_INCLUDE, photos: { select: { id: true, thumbKey: true, createdAt: true }, take: 10, orderBy: { createdAt: "desc" } } },
    });
    if (!tool) throw AppError.notFound("Herramienta");
    // La app usa availableEvents para mostrar solo las acciones válidas.
    return { ...tool, availableEvents: availableEvents(tool.status) };
  }

  async getByCode(code: string) {
    const tool = await this.prisma.tool.findUnique({ where: { code: code.toUpperCase() }, select: { id: true } });
    if (!tool) throw AppError.notFound("Herramienta");
    return this.get(tool.id);
  }

  /** Historial completo (cadena de custodia + ciclo de vida), del más reciente al más antiguo. */
  async history(id: string) {
    const exists = await this.prisma.tool.count({ where: { id } });
    if (!exists) throw AppError.notFound("Herramienta");
    return this.prisma.lifecycleEvent.findMany({
      where: { toolId: id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: {
        reportedBy: { select: { id: true, name: true } },
        location: { select: { id: true, name: true, type: true } },
        photos: { select: { id: true, thumbKey: true } },
        transfer: {
          select: {
            id: true,
            movedAt: true,
            fromLocation: { select: { id: true, name: true } },
            toLocation: { select: { id: true, name: true } },
            deliveredBy: { select: { id: true, name: true } },
            receivedBy: { select: { id: true, name: true } },
            vehicle: { select: { id: true, plate: true } },
            photos: { select: { id: true, thumbKey: true } },
          },
        },
      },
    });
  }

  /** Alta: la herramienta nace en una bodega con un evento PURCHASE. */
  async create(input: ToolCreateInput, ctx: Ctx) {
    return this.prisma.$transaction(async (tx) => {
      const [location, category] = await Promise.all([
        tx.location.findUnique({ where: { id: input.initialLocationId } }),
        tx.toolCategory.findUnique({ where: { id: input.categoryId } }),
      ]);
      if (!category) throw AppError.badRequest("INVALID_CATEGORY", "Categoría inexistente");
      if (!location || !location.active || location.type !== "BODEGA") {
        throw AppError.badRequest("INVALID_LOCATION", "La ubicación inicial debe ser una bodega activa");
      }

      const { initialLocationId, ...data } = input;
      const tool = await tx.tool.create({
        data: { ...data, status: "BODEGA", currentLocationId: initialLocationId, statusChangedAt: input.purchaseDate },
        include: LIST_INCLUDE,
      });
      await tx.lifecycleEvent.create({
        data: {
          toolId: tool.id,
          type: "PURCHASE",
          fromStatus: null,
          toStatus: "BODEGA",
          occurredAt: input.purchaseDate,
          cost: input.purchasePrice,
          locationId: initialLocationId,
          reportedById: ctx.actorId,
        },
      });
      await audit(tx, { actorId: ctx.actorId, action: "tool.create", entity: "tool", entityId: tool.id, diff: input, ip: ctx.ip });
      return tool;
    });
  }

  /** Solo datos descriptivos/financieros. Estado y ubicación cambian por traslados o eventos. */
  async update(id: string, input: ToolUpdateInput, ctx: Ctx) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.tool.findUnique({ where: { id } });
      if (!before) throw AppError.notFound("Herramienta");

      if (input.purchaseDate) {
        const first = await tx.lifecycleEvent.findFirst({
          where: { toolId: id, type: { not: "PURCHASE" } },
          orderBy: { occurredAt: "asc" },
          select: { occurredAt: true },
        });
        if (first && input.purchaseDate > first.occurredAt) {
          throw AppError.badRequest("OUT_OF_ORDER", "La fecha de compra no puede ser posterior a su primer movimiento");
        }
      }

      const after = await tx.tool.update({ where: { id }, data: input, include: LIST_INCLUDE });

      const diff: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input)) {
        const prev = (before as Record<string, unknown>)[k];
        if (v !== undefined && String(prev) !== String(v)) diff[k] = { from: prev, to: v };
      }
      // Precio/fecha de compra afectan reportes financieros: siempre quedan auditados.
      await audit(tx, { actorId: ctx.actorId, action: "tool.update", entity: "tool", entityId: id, diff, ip: ctx.ip });
      return after;
    });
  }
}
