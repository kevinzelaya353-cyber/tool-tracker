import type { Prisma, PrismaClient } from "@prisma/client";
import type { LocationType, TransferCreateInput, TransferListQuery } from "@tt/shared";
import { checkTransfer } from "../../domain/rules.js";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/pagination.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";

type Ctx = { actorId: string; ip?: string };

const DETAIL_INCLUDE = {
  fromLocation: { select: { id: true, name: true, type: true } },
  toLocation: { select: { id: true, name: true, type: true } },
  deliveredBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, description: true } },
  items: { include: { tool: { select: { id: true, code: true, brand: true, model: true, category: { select: { name: true } } } } } },
  photos: { select: { id: true, storageKey: true, thumbKey: true, createdAt: true } },
} satisfies Prisma.TransferInclude;

export class TransfersService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Registra un traslado de una o varias herramientas en una sola transacción:
   * bloquea las herramientas, valida reglas, crea cabecera + ítems + eventos,
   * actualiza estado/ubicación/custodio y asocia las fotos de evidencia.
   * Si una sola herramienta es inválida, no se mueve ninguna.
   */
  async create(input: TransferCreateInput, ctx: Ctx) {
    const toolIds = input.items.map((i) => i.toolId);

    return this.prisma.$transaction(async (tx) => {
      // FOR SHARE: impide que se cierre la ubicación mientras dura el traslado.
      const locations = await tx.$queryRaw<{ id: string; type: LocationType; active: boolean }[]>`
        SELECT id, type::text AS "type", active FROM locations
        WHERE id IN (${input.fromLocationId}::uuid, ${input.toLocationId}::uuid)
        FOR SHARE
      `;
      const from = locations.find((l) => l.id === input.fromLocationId);
      const to = locations.find((l) => l.id === input.toLocationId);
      if (!from) throw AppError.badRequest("INVALID_LOCATION", "Ubicación de origen inexistente");
      if (!to || !to.active) throw AppError.badRequest("INVALID_LOCATION", "El destino no existe o está cerrado");

      const people = await tx.user.findMany({
        where: { id: { in: [input.deliveredById, input.receivedById] }, active: true },
        select: { id: true },
      });
      if (people.length !== 2) throw AppError.badRequest("INVALID_PERSON", "Quien entrega o recibe no es un usuario activo");

      if (input.vehicleId) {
        const vehicle = await tx.vehicle.findFirst({ where: { id: input.vehicleId, active: true }, select: { id: true } });
        if (!vehicle) throw AppError.badRequest("INVALID_VEHICLE", "Vehículo inexistente o inactivo");
      }

      const tools = await lockTools(tx, toolIds);
      const violations = checkTransfer(tools, {
        toolIds,
        fromLocationId: input.fromLocationId,
        destinationType: to.type,
        movedAt: input.movedAt,
      });
      if (violations.length > 0) {
        throw AppError.conflict("TRANSFER_REJECTED", "Una o más herramientas no se pueden trasladar", violations);
      }

      const newStatus = to.type === "BODEGA" ? "BODEGA" : "EN_PROYECTO";
      const transfer = await tx.transfer.create({
        data: {
          id: input.id,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          deliveredById: input.deliveredById,
          receivedById: input.receivedById,
          vehicleId: input.vehicleId,
          movedAt: input.movedAt,
          notes: input.notes,
          createdById: ctx.actorId,
          items: { create: input.items.map((i) => ({ toolId: i.toolId, conditionNote: i.conditionNote })) },
        },
      });

      const statusById = new Map(tools.map((t) => [t.id, t.status]));
      await tx.lifecycleEvent.createMany({
        data: toolIds.map((toolId) => ({
          toolId,
          type: "TRANSFER" as const,
          fromStatus: statusById.get(toolId),
          toStatus: newStatus,
          occurredAt: input.movedAt,
          locationId: input.toLocationId,
          transferId: transfer.id,
          reportedById: ctx.actorId,
        })),
      });

      await tx.tool.updateMany({
        where: { id: { in: toolIds } },
        data: {
          status: newStatus,
          currentLocationId: input.toLocationId,
          // En bodega la responsabilidad es de la bodega, no de una persona.
          currentCustodianId: to.type === "BODEGA" ? null : input.receivedById,
          statusChangedAt: input.movedAt,
        },
      });

      await attachPhotos(tx, input.photoIds, ctx.actorId, { transferId: transfer.id });

      await audit(tx, {
        actorId: ctx.actorId,
        action: "transfer.create",
        entity: "transfer",
        entityId: transfer.id,
        diff: { from: input.fromLocationId, to: input.toLocationId, tools: toolIds, photos: input.photoIds.length },
        ip: ctx.ip,
      });

      return tx.transfer.findUniqueOrThrow({ where: { id: transfer.id }, include: DETAIL_INCLUDE });
    });
  }

  async list(q: TransferListQuery) {
    const where: Prisma.TransferWhereInput = {
      ...(q.locationId && { OR: [{ fromLocationId: q.locationId }, { toLocationId: q.locationId }] }),
      ...(q.toolId && { items: { some: { toolId: q.toolId } } }),
      ...((q.from || q.to) && { movedAt: { gte: q.from, lte: q.to } }),
    };
    const [total, data] = await Promise.all([
      this.prisma.transfer.count({ where }),
      this.prisma.transfer.findMany({
        where,
        orderBy: { movedAt: "desc" },
        include: {
          fromLocation: { select: { id: true, name: true } },
          toLocation: { select: { id: true, name: true } },
          deliveredBy: { select: { id: true, name: true } },
          receivedBy: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true } },
          _count: { select: { items: true, photos: true } },
        },
        ...pageArgs(q),
      }),
    ]);
    return toPage(data, total, q);
  }

  async get(id: string) {
    const t = await this.prisma.transfer.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!t) throw AppError.notFound("Traslado");
    return t;
  }
}
