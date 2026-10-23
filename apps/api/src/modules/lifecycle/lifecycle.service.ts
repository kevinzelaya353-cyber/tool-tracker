import type { PrismaClient } from "@prisma/client";
import { can, EVENT_REQUIRES_LOCATION, type LifecycleEventCreateInput, type LocationType } from "@tt/shared";
import { checkLifecycleEvent } from "../../domain/rules.js";
import { audit } from "../../lib/audit.js";
import { requireOrgId } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";
import type { AccessClaims } from "../auth/token.service.js";

/** Eventos tras los cuales la herramienta deja de estar a cargo de una persona. */
const CLEARS_CUSTODIAN = new Set(["MAINTENANCE_START", "MAINTENANCE_END", "RECOVERY", "DECOMMISSION"]);

export class LifecycleService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: LifecycleEventCreateInput, actor: AccessClaims, ip?: string) {
    if (input.type === "DECOMMISSION" && !can(actor.role, "lifecycle:decommission")) {
      throw AppError.forbidden("Solo un administrador puede dar de baja herramientas");
    }

    return this.prisma.$transaction(async (tx) => {
      const [tool] = await lockTools(tx, [input.toolId]);
      if (!tool) throw AppError.notFound("Herramienta");

      let destinationType: LocationType | undefined;
      if (EVENT_REQUIRES_LOCATION[input.type]) {
        if (!input.locationId) {
          throw AppError.badRequest("DESTINATION_REQUIRED", `${input.type} requiere indicar la bodega de destino`);
        }
        const [loc] = await tx.$queryRaw<{ type: LocationType; active: boolean }[]>`
          SELECT type::text AS "type", active FROM locations
          WHERE id = ${input.locationId}::uuid AND organization_id = ${requireOrgId()}::uuid FOR SHARE
        `;
        if (!loc || !loc.active) throw AppError.badRequest("INVALID_LOCATION", "Ubicación inexistente o cerrada");
        destinationType = loc.type;
      } else if (input.locationId) {
        throw AppError.badRequest("LOCATION_NOT_ALLOWED", `${input.type} no cambia la ubicación`);
      }

      const check = checkLifecycleEvent(tool, {
        type: input.type,
        occurredAt: input.occurredAt,
        destinationType,
        hasCost: input.cost !== undefined,
      });
      if (!check.ok) throw AppError.conflict("EVENT_REJECTED", check.violation.message, [check.violation]);

      const event = await tx.lifecycleEvent.create({
        data: {
          organizationId: requireOrgId(),
          toolId: tool.id,
          type: input.type,
          fromStatus: tool.status,
          toStatus: check.to,
          occurredAt: input.occurredAt,
          cost: input.cost,
          description: input.description,
          // Para eventos sin destino se registra la última ubicación conocida (dónde se dañó/perdió).
          locationId: input.locationId ?? tool.currentLocationId,
          reportedById: actor.userId,
        },
      });

      await tx.tool.update({
        where: { id: tool.id },
        data: {
          status: check.to,
          statusChangedAt: input.occurredAt,
          ...(input.locationId && { currentLocationId: input.locationId }),
          ...(CLEARS_CUSTODIAN.has(input.type) && { currentCustodianId: null }),
        },
      });

      await attachPhotos(tx, input.photoIds, actor.userId, { lifecycleEventId: event.id, toolId: tool.id });

      await audit(tx, {
        actorId: actor.userId,
        action: `lifecycle.${input.type.toLowerCase()}`,
        entity: "tool",
        entityId: tool.id,
        diff: { eventId: event.id, from: tool.status, to: check.to, cost: input.cost ?? null },
        ip,
      });

      return event;
    });
  }
}
