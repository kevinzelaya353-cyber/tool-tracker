import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { LocationType, TransferCreateInput, TransferListQuery, TransferPhotosInput } from "@tt/shared";
import { checkTransfer } from "../../domain/rules.js";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/pagination.js";
import type { LatLng, RouteProvider } from "../../lib/routing.js";
import type { ObjectStorage } from "../media/storage.js";
import { renderStaticMap, type TileFetcher } from "./static-map.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";

type Ctx = { actorId: string; ip?: string };

const DETAIL_INCLUDE = {
  fromLocation: { select: { id: true, name: true, type: true, latitude: true, longitude: true } },
  toLocation: { select: { id: true, name: true, type: true, latitude: true, longitude: true } },
  deliveredBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, description: true } },
  items: { include: { tool: { select: { id: true, code: true, brand: true, model: true, category: { select: { name: true } } } } } },
  photos: { select: { id: true, thumbKey: true, stage: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.TransferInclude;

export class TransfersService {
  private readonly routing?: RouteProvider;
  /** Generaciones de mapa en curso, para no dibujar dos veces el mismo traslado a la vez. */
  private readonly rendering = new Map<string, Promise<string | null>>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: { routing?: RouteProvider; storage?: ObjectStorage; tiles?: TileFetcher; urlTtlSec?: number } = {},
  ) {
    this.routing = opts.routing;
  }

  /** Ruta entre dos ubicaciones con coordenadas; null si a alguna le falta el punto o no hay servicio. */
  private async routeBetween(fromId: string, toId: string) {
    if (!this.routing) return null;
    const locs = await this.prisma.location.findMany({
      where: { id: { in: [fromId, toId] } },
      select: { id: true, latitude: true, longitude: true },
    });
    const point = (id: string): LatLng | null => {
      const l = locs.find((x) => x.id === id);
      return l?.latitude != null && l.longitude != null ? { lat: l.latitude, lng: l.longitude } : null;
    };
    const from = point(fromId);
    const to = point(toId);
    return from && to ? this.routing(from, to) : null;
  }

  /**
   * Registra un traslado de una o varias herramientas en una sola transacción:
   * bloquea las herramientas, valida reglas, crea cabecera + ítems + eventos,
   * actualiza estado/ubicación/custodio y asocia las fotos de evidencia.
   * Si una sola herramienta es inválida, no se mueve ninguna.
   */
  async create(input: TransferCreateInput, ctx: Ctx) {
    const toolIds = input.items.map((i) => i.toolId);
    // Fuera de la transacción: es una llamada de red y no debe retener los bloqueos.
    const route = await this.routeBetween(input.fromLocationId, input.toLocationId);

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
          ...(route && {
            routeGeometry: route.geometry,
            routeDistanceM: route.distanceM,
            routeDurationS: route.durationS,
          }),
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

      await attachPhotos(tx, input.photoIds, ctx.actorId, { transferId: transfer.id, stage: "ENTREGA" });
      await attachPhotos(tx, input.receptionPhotoIds, ctx.actorId, { transferId: transfer.id, stage: "RECEPCION" });

      await audit(tx, {
        actorId: ctx.actorId,
        action: "transfer.create",
        entity: "transfer",
        entityId: transfer.id,
        diff: { from: input.fromLocationId, to: input.toLocationId, tools: toolIds, photos: input.photoIds.length + input.receptionPhotoIds.length },
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
    if (t.routeGeometry) return t;

    // Traslados anteriores a que la ubicación tuviera punto en el mapa: se calcula al abrirlos.
    const route = await this.routeBetween(t.fromLocationId, t.toLocationId);
    if (!route) return t;
    return this.prisma.transfer.update({
      where: { id },
      data: { routeGeometry: route.geometry, routeDistanceM: route.distanceM, routeDurationS: route.durationS },
      include: DETAIL_INCLUDE,
    });
  }

  /**
   * URL firmada de la imagen del mapa (para la lista de traslados). Se dibuja una sola vez y se
   * guarda; se vuelve a dibujar solo si cambian los puntos o la ruta. null si falta algún punto.
   */
  async mapImage(id: string): Promise<{ url: string | null }> {
    const { storage, tiles, urlTtlSec = 600 } = this.opts;
    if (!storage || !tiles) return { url: null };
    const t = await this.get(id); // calcula la ruta si faltaba
    const from = t.fromLocation;
    const to = t.toLocation;
    if (from.latitude == null || from.longitude == null || to.latitude == null || to.longitude == null) return { url: null };

    const route = (t.routeGeometry as [number, number][] | null) ?? null;
    const hash = createHash("sha1")
      .update(JSON.stringify([from.latitude, from.longitude, to.latitude, to.longitude, t.routeDistanceM, route?.length ?? 0]))
      .digest("hex")
      .slice(0, 12);
    const key = `maps/${id}-${hash}.jpg`;

    if (t.mapKey !== key) {
      let job = this.rendering.get(key);
      if (!job) {
        job = (async () => {
          try {
            const img = await renderStaticMap(
              { from: { lat: from.latitude!, lng: from.longitude! }, to: { lat: to.latitude!, lng: to.longitude! }, route },
              tiles,
            );
            await storage.put(key, img, "image/jpeg");
            await this.prisma.transfer.update({ where: { id }, data: { mapKey: key } });
            if (t.mapKey) await storage.remove([t.mapKey]).catch(() => undefined); // mapa anterior
            return key;
          } catch {
            return null; // sin red para las teselas: se reintenta en la próxima consulta
          } finally {
            this.rendering.delete(key);
          }
        })();
        this.rendering.set(key, job);
      }
      if (!(await job)) return { url: null };
    }
    return { url: await storage.signedUrl(key, urlTtlSec) };
  }

  /** Agrega fotos de entrega o recepción a un traslado ya registrado (el resto del traslado no se edita). */
  async addPhotos(id: string, input: TransferPhotosInput, ctx: Ctx) {
    await this.prisma.$transaction(async (tx) => {
      const exists = await tx.transfer.count({ where: { id } });
      if (!exists) throw AppError.notFound("Traslado");
      const already = await tx.photo.count({ where: { transferId: id } });
      if (already + input.photoIds.length > 40) {
        throw AppError.badRequest("TOO_MANY_PHOTOS", "Un traslado admite hasta 40 fotos");
      }
      await attachPhotos(tx, input.photoIds, ctx.actorId, { transferId: id, stage: input.stage });
      await audit(tx, {
        actorId: ctx.actorId,
        action: "transfer.add_photos",
        entity: "transfer",
        entityId: id,
        diff: { stage: input.stage, photos: input.photoIds.length },
        ip: ctx.ip,
      });
    });
    return this.get(id);
  }
}
