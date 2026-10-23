import { Prisma, type PrismaClient } from "@prisma/client";
import type { LocationType, RentalCreateInput, RentalListQuery, RentalReturnInput, ToolStatus } from "@tt/shared";
import { checkRentalEvent } from "../../domain/rules.js";
import { audit } from "../../lib/audit.js";
import { requireOrgId } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/pagination.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";
import type { AccessClaims } from "../auth/token.service.js";
import { DAMAGE_REPORT_INCLUDE } from "../damage/damage.service.js";

type Tx = Prisma.TransactionClient;

const VISIBLE_PHOTO = { hiddenAt: null } satisfies Prisma.PhotoWhereInput;

const TOOL_SUMMARY = {
  select: { id: true, code: true, brand: true, model: true, status: true, category: { select: { id: true, name: true } } },
} satisfies Prisma.ToolDefaultArgs;

const LIST_INCLUDE = {
  tool: TOOL_SUMMARY,
  location: { select: { id: true, name: true, type: true } },
} satisfies Prisma.RentalInclude;

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  receivedBy: { select: { id: true, name: true } },
  returnedBy: { select: { id: true, name: true } },
  // Recepción y devolución se distinguen por `stage`; nunca se mezclan ni se reemplazan.
  photos: { where: VISIBLE_PHOTO, select: { id: true, stage: true, createdAt: true }, orderBy: { createdAt: "asc" } },
  incidents: { include: DAMAGE_REPORT_INCLUDE, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.RentalInclude;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export class RentalsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Recepción de una herramienta rentada: abre un período de alquiler con la evidencia de cómo llegó.
   * Con `tool` la da de alta (rentada, sin precio); con `toolId` es un nuevo período de una
   * herramienta rentada ya conocida. Reintentar con el mismo `id` devuelve el mismo alquiler.
   */
  async create(input: RentalCreateInput, actor: AccessClaims, ip?: string) {
    const previous = await this.findRetry(input.id, actor);
    if (previous) return { rental: previous, created: false };

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const [loc] = await tx.$queryRaw<{ type: LocationType; active: boolean }[]>`
          SELECT type::text AS "type", active FROM locations
          WHERE id = ${input.locationId}::uuid AND organization_id = ${requireOrgId()}::uuid FOR SHARE
        `;
        if (!loc || !loc.active) throw AppError.badRequest("INVALID_LOCATION", "Ubicación inexistente o cerrada");
        const placed: ToolStatus = loc.type === "BODEGA" ? "BODEGA" : "EN_PROYECTO";

        const { toolId, fromStatus } = input.tool
          ? await this.createRentedTool(tx, input, placed, actor)
          : await this.prepareReturningTool(tx, input, loc.type);

        const event = await tx.lifecycleEvent.create({
          data: {
            organizationId: requireOrgId(),
            toolId,
            type: "RENTAL_RECEIVE",
            fromStatus,
            toStatus: placed,
            occurredAt: input.receivedAt,
            description: `Recibida en alquiler de ${input.lessor}`,
            locationId: input.locationId,
            reportedById: actor.userId,
          },
        });
        await tx.tool.update({
          where: { id: toolId },
          data: { status: placed, statusChangedAt: input.receivedAt, currentLocationId: input.locationId, currentCustodianId: null },
        });

        const rental = await tx.rental.create({
          data: {
            organizationId: requireOrgId(),
            id: input.id,
            toolId,
            lessor: input.lessor,
            locationId: input.locationId,
            receivedAt: input.receivedAt,
            expectedReturnAt: input.expectedReturnAt,
            notes: input.notes,
            receptionCondition: input.receptionCondition,
            receptionDescription: input.receptionDescription,
            receptionNotes: input.receptionNotes,
            receivedById: actor.userId,
            receiveEventId: event.id,
          },
        });
        await attachPhotos(tx, input.photoIds, actor.userId, { rentalId: rental.id, toolId, stage: "RECEPCION" });

        await audit(tx, {
          actorId: actor.userId,
          action: "rental.receive",
          entity: "tool",
          entityId: toolId,
          diff: {
            rentalId: rental.id,
            newTool: Boolean(input.tool),
            lessor: input.lessor,
            locationId: input.locationId,
            condition: input.receptionCondition,
            photos: input.photoIds.length,
          },
          ip,
        });
        return rental.id;
      });
      return { rental: await this.get(id), created: true };
    } catch (err) {
      if (isUniqueViolation(err)) {
        const winner = await this.findRetry(input.id, actor);
        if (winner) return { rental: winner, created: false };
      }
      throw err; // p. ej. código de herramienta repetido → 409 DUPLICATE
    }
  }

  /** Alta de una herramienta rentada: no es un activo, así que no lleva precio ni evento de compra. */
  private async createRentedTool(tx: Tx, input: RentalCreateInput, placed: ToolStatus, actor: AccessClaims) {
    const data = input.tool!;
    const category = await tx.toolCategory.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!category) throw AppError.badRequest("INVALID_CATEGORY", "Categoría inexistente");
    const tool = await tx.tool.create({
      data: {
        organizationId: requireOrgId(),
        code: data.code,
        categoryId: data.categoryId,
        brand: data.brand,
        model: data.model,
        serial: data.serial,
        supplier: input.lessor,
        ownership: "RENTADA",
        purchasePrice: 0,
        purchaseDate: input.receivedAt,
        status: placed,
        currentLocationId: input.locationId,
        statusChangedAt: input.receivedAt,
        coverPhotoId: data.photoId,
      },
      select: { id: true },
    });
    if (data.photoId) await attachPhotos(tx, [data.photoId], actor.userId, { toolId: tool.id });
    return { toolId: tool.id, fromStatus: null };
  }

  /** Nuevo período de alquiler de una herramienta rentada que ya se había devuelto. */
  private async prepareReturningTool(tx: Tx, input: RentalCreateInput, destinationType: LocationType) {
    const [tool] = await lockTools(tx, [input.toolId!]);
    if (!tool) throw AppError.notFound("Herramienta");
    const { ownership } = await tx.tool.findUniqueOrThrow({ where: { id: tool.id }, select: { ownership: true } });
    if (ownership !== "RENTADA") {
      throw AppError.conflict("NOT_RENTED", `${tool.code} es una herramienta propia: no se registra como alquiler`);
    }
    const check = checkRentalEvent(tool, { type: "RENTAL_RECEIVE", occurredAt: input.receivedAt, destinationType });
    if (!check.ok) throw AppError.conflict("RENTAL_REJECTED", check.violation.message, [check.violation]);
    return { toolId: tool.id, fromStatus: tool.status };
  }

  /**
   * Devolución al arrendador. Solo completa los datos de devolución: la recepción y sus fotos
   * quedan intactas (también lo impide un trigger en BD). Repetir la misma devolución (reintento)
   * devuelve el alquiler ya cerrado; una devolución distinta sobre uno cerrado se rechaza.
   */
  async returnRental(id: string, input: RentalReturnInput, actor: AccessClaims, ip?: string) {
    const found = await this.prisma.rental.findUnique({ where: { id }, select: { toolId: true } });
    if (!found) throw AppError.notFound("Alquiler");

    const result = await this.prisma.$transaction(async (tx) => {
      const [tool] = await lockTools(tx, [found.toolId]); // serializa devoluciones simultáneas
      const rental = await tx.rental.findUniqueOrThrow({ where: { id } });
      if (rental.status === "DEVUELTO") {
        const sameRequest = rental.returnedById === actor.userId && rental.returnedAt?.getTime() === input.returnedAt.getTime();
        if (sameRequest) return { created: false };
        throw AppError.conflict("ALREADY_RETURNED", "Este alquiler ya se devolvió");
      }
      if (input.returnedAt < rental.receivedAt) {
        throw AppError.badRequest("BEFORE_RECEPTION", "La devolución no puede ser anterior a la recepción");
      }
      const check = checkRentalEvent(tool!, { type: "RENTAL_RETURN", occurredAt: input.returnedAt });
      if (!check.ok) throw AppError.conflict("RENTAL_REJECTED", check.violation.message, [check.violation]);

      const event = await tx.lifecycleEvent.create({
        data: {
          organizationId: requireOrgId(),
          toolId: tool!.id,
          type: "RENTAL_RETURN",
          fromStatus: tool!.status,
          toStatus: check.to,
          occurredAt: input.returnedAt,
          description: input.differences ?? input.returnDescription ?? `Devuelta a ${rental.lessor}`,
          locationId: tool!.currentLocationId, // desde dónde se devolvió
          reportedById: actor.userId,
        },
      });
      await tx.tool.update({
        where: { id: tool!.id },
        data: { status: check.to, statusChangedAt: input.returnedAt, currentLocationId: null, currentCustodianId: null },
      });
      await tx.rental.update({
        where: { id },
        data: {
          status: "DEVUELTO",
          returnedAt: input.returnedAt,
          returnCondition: input.returnCondition,
          returnDescription: input.returnDescription,
          returnNotes: input.returnNotes,
          returnDifferences: input.differences,
          returnedById: actor.userId,
          returnEventId: event.id,
        },
      });
      await attachPhotos(tx, input.photoIds, actor.userId, { rentalId: id, toolId: tool!.id, stage: "DEVOLUCION" });

      await audit(tx, {
        actorId: actor.userId,
        action: "rental.return",
        entity: "tool",
        entityId: tool!.id,
        diff: { rentalId: id, condition: input.returnCondition, from: tool!.status, photos: input.photoIds.length },
        ip,
      });
      return { created: true };
    });
    return { rental: await this.get(id), created: result.created };
  }

  private async findRetry(id: string, actor: AccessClaims) {
    const existing = await this.prisma.rental.findUnique({ where: { id }, select: { receivedById: true } });
    if (!existing) return null;
    if (existing.receivedById !== actor.userId) throw AppError.conflict("ID_IN_USE", "El identificador del alquiler ya está en uso");
    return this.get(id);
  }

  async list(q: RentalListQuery) {
    const where: Prisma.RentalWhereInput = { toolId: q.toolId, status: q.status };
    const [total, data] = await Promise.all([
      this.prisma.rental.count({ where }),
      this.prisma.rental.findMany({ where, include: LIST_INCLUDE, orderBy: [{ receivedAt: "desc" }], ...pageArgs(q) }),
    ]);
    return toPage(data, total, q);
  }

  /**
   * Detalle con la línea de tiempo del período: recepción, incidencias, otros movimientos de la
   * herramienta en esas fechas (traslados, mantenimiento…) y devolución. Sirve también cerrado.
   */
  async get(id: string) {
    const rental = await this.prisma.rental.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!rental) throw AppError.notFound("Alquiler");
    const events = await this.prisma.lifecycleEvent.findMany({
      where: {
        toolId: rental.toolId,
        type: { notIn: ["RENTAL_RECEIVE", "RENTAL_RETURN"] },
        occurredAt: { gte: rental.receivedAt, ...(rental.returnedAt && { lte: rental.returnedAt }) },
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        type: true,
        occurredAt: true,
        toStatus: true,
        description: true,
        reportedBy: { select: { id: true, name: true } },
        transfer: { select: { id: true, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } } } },
      },
    });
    return { ...rental, events };
  }
}
