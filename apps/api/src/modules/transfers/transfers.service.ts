import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  can,
  ITEM_OUTCOME,
  type LocationType,
  type ReceptionMethod,
  type Role,
  type ToolStatus,
  type TransferCreateInput,
  type TransferListQuery,
  type TransferPhotosInput,
  type TransferReceiveInput,
} from "@tt/shared";
import { checkTransfer } from "../../domain/rules.js";
import { checkCredential } from "../auth/auth.service.js";
import { photoDistances } from "../../lib/geo.js";
import { audit } from "../../lib/audit.js";
import { requireOrgId } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { pageArgs, toPage } from "../../lib/pagination.js";
import type { LatLng, RouteProvider } from "../../lib/routing.js";
import type { ObjectStorage } from "../media/storage.js";
import { renderStaticMap, type TileFetcher } from "./static-map.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";

type Ctx = { actorId: string; ip?: string };
type ActorCtx = Ctx & { role: Role };

const DETAIL_INCLUDE = {
  fromLocation: { select: { id: true, name: true, type: true, latitude: true, longitude: true } },
  toLocation: { select: { id: true, name: true, type: true, latitude: true, longitude: true } },
  deliveredBy: { select: { id: true, name: true } },
  receivedBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
  receptionBy: { select: { id: true, name: true } },
  vehicle: { select: { id: true, plate: true, description: true } },
  items: { include: { tool: { select: { id: true, code: true, brand: true, model: true, category: { select: { name: true } } } } } },
  // Las eliminadas desde la app no se muestran (siguen en el Excel).
  photos: {
    where: { hiddenAt: null },
    select: { id: true, thumbKey: true, stage: true, createdAt: true, latitude: true, longitude: true, accuracyM: true },
    orderBy: { createdAt: "asc" },
  },
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
   *
   * Sin chofer, llega al destino en el acto. Con chofer (`driverId`) las herramientas quedan
   * EN_TRANSITO a cargo del chofer hasta que se confirma la recepción con `receive`.
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
          AND organization_id = ${requireOrgId()}::uuid
        FOR SHARE
      `;
      const from = locations.find((l) => l.id === input.fromLocationId);
      const to = locations.find((l) => l.id === input.toLocationId);
      if (!from) throw AppError.badRequest("INVALID_LOCATION", "Ubicación de origen inexistente");
      if (!to || !to.active) throw AppError.badRequest("INVALID_LOCATION", "El destino no existe o está cerrado");

      const ids = [input.deliveredById, input.receivedById, ...(input.driverId ? [input.driverId] : [])];
      const people = await tx.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
      if (people.length !== new Set(ids).size) {
        throw AppError.badRequest("INVALID_PERSON", "Quien entrega, recibe o lleva las herramientas no es un usuario activo");
      }
      if (input.driverId && input.driverId === input.receivedById) {
        throw AppError.badRequest("INVALID_PERSON", "El chofer no puede ser quien recibe: la recepción la confirma otra persona");
      }

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
        dispatch: Boolean(input.driverId),
      });
      if (violations.length > 0) {
        throw AppError.conflict("TRANSFER_REJECTED", "Una o más herramientas no se pueden trasladar", violations);
      }

      const inTransit = Boolean(input.driverId);
      const arrived: ToolStatus = to.type === "BODEGA" ? "BODEGA" : "EN_PROYECTO";
      const newStatus: ToolStatus = inTransit ? "EN_TRANSITO" : arrived;
      const transfer = await tx.transfer.create({
        data: {
          organizationId: requireOrgId(),
          id: input.id,
          fromLocationId: input.fromLocationId,
          toLocationId: input.toLocationId,
          deliveredById: input.deliveredById,
          receivedById: input.receivedById,
          driverId: input.driverId,
          vehicleId: input.vehicleId,
          movedAt: input.movedAt,
          status: inTransit ? "EN_TRANSITO" : "RECIBIDO",
          receivedAt: inTransit ? null : input.movedAt,
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
          organizationId: requireOrgId(),
          toolId,
          type: inTransit ? ("DISPATCH" as const) : ("TRANSFER" as const),
          fromStatus: statusById.get(toolId),
          toStatus: newStatus,
          occurredAt: input.movedAt,
          // En tránsito no está en ningún lugar.
          locationId: inTransit ? null : input.toLocationId,
          transferId: transfer.id,
          reportedById: ctx.actorId,
        })),
      });

      await tx.tool.updateMany({
        where: { id: { in: toolIds } },
        data: {
          status: newStatus,
          currentLocationId: inTransit ? null : input.toLocationId,
          // En tránsito responde el chofer; en bodega, la bodega (no una persona).
          currentCustodianId: inTransit ? input.driverId : to.type === "BODEGA" ? null : input.receivedById,
          statusChangedAt: input.movedAt,
        },
      });

      await attachPhotos(tx, input.photoIds, ctx.actorId, { transferId: transfer.id, stage: "ENTREGA" });
      await attachPhotos(tx, input.receptionPhotoIds, ctx.actorId, { transferId: transfer.id, stage: "RECEPCION" });

      await audit(tx, {
        actorId: ctx.actorId,
        action: inTransit ? "transfer.dispatch" : "transfer.create",
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
      ...(q.status && { status: q.status }),
      ...(q.driverId && { driverId: q.driverId }),
      ...(q.receivedById && { receivedById: q.receivedById }),
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
          driver: { select: { id: true, name: true } },
          vehicle: { select: { id: true, plate: true } },
          _count: { select: { items: true, photos: { where: { hiddenAt: null } } } },
        },
        ...pageArgs(q),
      }),
    ]);
    return toPage(data, total, q);
  }

  async get(id: string) {
    const t = await this.findWithRoute(id);
    return { ...t, photoDistances: photoDistances(t.photos, t.fromLocation, t.toLocation) };
  }

  /**
   * Confirma la llegada de un traslado con chofer. Cada herramienta llega bien (al destino),
   * dañada (al destino y luego DANADA) o no llega (EXTRAVIADA, con el chofer como último responsable).
   *
   * La confirma quien debía recibir: desde su sesión, o escribiendo su PIN en el teléfono del
   * chofer (los fallos cuentan para el bloqueo de su cuenta). Quien tiene `transfers:override`
   * puede confirmar en su nombre; queda registrado como SUPERVISION.
   */
  async receive(id: string, input: TransferReceiveInput, ctx: ActorCtx) {
    // El PIN se verifica fuera de la transacción: si fuera dentro, el error del PIN incorrecto
    // revertiría también el contador de intentos y se podría adivinar sin límite.
    const head = await this.prisma.transfer.findUnique({
      where: { id },
      select: { receivedBy: { select: { id: true, name: true, role: true, active: true, passwordHash: true, lockedAt: true } } },
    });
    if (!head) throw AppError.notFound("Traslado");
    const method = await this.receptionMethod(head.receivedBy, input.pin, ctx);

    await this.prisma.$transaction(async (tx) => {
      // Bloquea el traslado: dos confirmaciones simultáneas no pueden aplicarse ambas.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM transfers WHERE id = ${id}::uuid AND organization_id = ${requireOrgId()}::uuid FOR UPDATE`;
      if (locked.length === 0) throw AppError.notFound("Traslado");
      const t = await tx.transfer.findUniqueOrThrow({
        where: { id },
        include: {
          items: { select: { toolId: true } },
          toLocation: { select: { name: true, type: true } },
          driver: { select: { name: true } },
        },
      });
      if (t.status !== "EN_TRANSITO") throw AppError.conflict("ALREADY_RECEIVED", "Este traslado ya fue recibido");
      if (input.receivedAt.getTime() < t.movedAt.getTime()) {
        throw AppError.badRequest("OUT_OF_ORDER", "La llegada no puede ser anterior a la salida");
      }

      const expected = new Set(t.items.map((i) => i.toolId));
      if (input.items.length !== expected.size || input.items.some((i) => !expected.has(i.toolId))) {
        throw AppError.badRequest("ITEMS_MISMATCH", "Indica el resultado de cada herramienta del traslado, y solo de esas");
      }

      const tools = await lockTools(tx, [...expected]);
      const notInTransit = tools.filter((tool) => tool.status !== "EN_TRANSITO");
      if (notInTransit.length) {
        throw AppError.conflict(
          "TRANSFER_REJECTED",
          "Alguna herramienta ya no está en tránsito",
          notInTransit.map((tool) => ({ toolId: tool.id, code: "NOT_IN_TRANSIT", message: `${tool.code}: ya no está en tránsito` })),
        );
      }

      const arrived: ToolStatus = t.toLocation.type === "BODEGA" ? "BODEGA" : "EN_PROYECTO";
      const custodian = t.toLocation.type === "BODEGA" ? null : t.receivedById;
      const at = input.receivedAt;
      const driverName = t.driver?.name ?? "el chofer";

      for (const item of input.items) {
        await tx.transferItem.update({
          where: { transferId_toolId: { transferId: id, toolId: item.toolId } },
          data: { outcome: item.outcome, receptionNote: item.note },
        });
        if (item.outcome === "NO_LLEGO") {
          // No llegó: queda extraviada y a cargo de quien la llevaba (último responsable).
          await tx.lifecycleEvent.create({
            data: {
              organizationId: requireOrgId(),
              toolId: item.toolId,
              type: "LOSS",
              fromStatus: "EN_TRANSITO",
              toStatus: "EXTRAVIADA",
              occurredAt: at,
              description: `No llegó a ${t.toLocation.name}; iba a cargo de ${driverName}. ${item.note ?? ""}`.trim().slice(0, 500),
              reportedById: ctx.actorId,
            },
          });
          await tx.tool.update({
            where: { id: item.toolId },
            data: { status: "EXTRAVIADA", currentLocationId: null, statusChangedAt: at },
          });
          continue;
        }
        await tx.lifecycleEvent.create({
          data: {
            organizationId: requireOrgId(),
            toolId: item.toolId,
            type: "TRANSFER",
            fromStatus: "EN_TRANSITO",
            toStatus: arrived,
            occurredAt: at,
            locationId: t.toLocationId,
            transferId: id,
            reportedById: ctx.actorId,
          },
        });
        if (item.outcome === "DANADA") {
          await tx.lifecycleEvent.create({
            data: {
              organizationId: requireOrgId(),
              toolId: item.toolId,
              type: "DAMAGE",
              fromStatus: arrived,
              toStatus: "DANADA",
              occurredAt: at,
              locationId: t.toLocationId,
              description: `Llegó dañada a ${t.toLocation.name}: ${item.note ?? ""}`.slice(0, 500),
              reportedById: ctx.actorId,
            },
          });
        }
        await tx.tool.update({
          where: { id: item.toolId },
          data: {
            status: item.outcome === "DANADA" ? "DANADA" : arrived,
            currentLocationId: t.toLocationId,
            currentCustodianId: custodian,
            statusChangedAt: at,
          },
        });
      }

      await tx.transfer.update({
        where: { id },
        data: {
          status: "RECIBIDO",
          receivedAt: at,
          receptionById: ctx.actorId,
          receptionMethod: method,
          receptionNotes: input.notes,
          receptionRecordedAt: new Date(),
        },
      });
      await attachPhotos(tx, input.photoIds, ctx.actorId, { transferId: id, stage: "RECEPCION" });

      const counts = Object.fromEntries(ITEM_OUTCOME.map((o) => [o, input.items.filter((i) => i.outcome === o).length]));
      await audit(tx, {
        actorId: ctx.actorId,
        action: "transfer.receive",
        entity: "transfer",
        entityId: id,
        diff: { method, receivedBy: t.receivedById, ...counts, photos: input.photoIds.length },
        ip: ctx.ip,
      });
    });
    return this.get(id);
  }

  /** Quién puede confirmar: el receptor con su sesión, su PIN en otro teléfono, o un supervisor. */
  private async receptionMethod(
    receiver: { id: string; name: string; role: Role; active: boolean; passwordHash: string | null; lockedAt: Date | null },
    pin: string | undefined,
    ctx: ActorCtx,
  ): Promise<ReceptionMethod> {
    if (ctx.actorId === receiver.id) return "SESION";
    if (pin) {
      if (!receiver.active || !receiver.passwordHash) {
        throw AppError.badRequest("RECEIVER_WITHOUT_PIN", `${receiver.name} no tiene PIN: debe confirmar un supervisor`);
      }
      const { valid, locked } = await checkCredential(this.prisma, receiver, pin, ctx.ip);
      if (locked) {
        throw new AppError(
          423,
          "ACCOUNT_LOCKED",
          `La cuenta de ${receiver.name} está bloqueada por intentos fallidos. Pide al administrador que la desbloquee.`,
        );
      }
      if (!valid) throw AppError.forbidden(`PIN de ${receiver.name} incorrecto`);
      await this.prisma.user.update({ where: { id: receiver.id }, data: { failedLogins: 0 } });
      return "PIN";
    }
    if (can(ctx.role, "transfers:override")) return "SUPERVISION";
    throw AppError.forbidden(`Solo ${receiver.name} puede confirmar la recepción: pídele que escriba su PIN`);
  }

  private async findWithRoute(id: string) {
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
    const t = await this.findWithRoute(id); // calcula la ruta si faltaba
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
      const already = await tx.photo.count({ where: { transferId: id, hiddenAt: null } });
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
