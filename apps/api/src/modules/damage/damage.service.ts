import { Prisma, type PrismaClient } from "@prisma/client";
import type { DamageReportCreateInput } from "@tt/shared";
import { checkDamageReport } from "../../domain/rules.js";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { attachPhotos, lockTools } from "../../lib/tx-helpers.js";
import type { AccessClaims } from "../auth/token.service.js";
import { requireOrgId } from "../../lib/context.js";

/** La app solo muestra las fotos que no se eliminaron desde ella. */
const VISIBLE_PHOTO = { hiddenAt: null } satisfies Prisma.PhotoWhereInput;

export const DAMAGE_REPORT_INCLUDE = {
  reportedBy: { select: { id: true, name: true } },
  rental: { select: { id: true, lessor: true, status: true } },
  lifecycleEvent: { select: { id: true, fromStatus: true, toStatus: true } },
  photos: { where: VISIBLE_PHOTO, select: { id: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.DamageReportInclude;

const isUniqueViolation = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

export class DamageService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Registra un reporte de daño (o una incidencia, si la herramienta está rentada). Nunca modifica
   * reportes anteriores. Si la petición se repite con el mismo id (reintento por corte de red),
   * devuelve el reporte ya guardado en lugar de crear otro: `created` indica cuál de los dos pasó.
   */
  async create(input: DamageReportCreateInput, actor: AccessClaims, ip?: string) {
    const previous = await this.findRetry(input, actor);
    if (previous) return { report: previous, created: false };

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const [tool] = await lockTools(tx, [input.toolId]);
        if (!tool) throw AppError.notFound("Herramienta");

        const check = checkDamageReport(tool, { occurredAt: input.occurredAt, condition: input.condition });
        if (!check.ok) throw AppError.conflict("DAMAGE_REJECTED", check.violation.message, [check.violation]);

        // Herramienta rentada: el reporte es una incidencia del período en que ocurrió (nunca de otro).
        const rental = await tx.rental.findFirst({
          where: {
            toolId: tool.id,
            receivedAt: { lte: input.occurredAt },
            OR: [{ status: "ACTIVO" }, { returnedAt: { gte: input.occurredAt } }],
          },
          orderBy: { receivedAt: "desc" },
          select: { id: true },
        });
        const ownership = await tx.tool.findUniqueOrThrow({ where: { id: tool.id }, select: { ownership: true } });
        if (ownership.ownership === "RENTADA" && !rental) {
          throw AppError.badRequest("OUTSIDE_RENTAL", `${tool.code}: la fecha no corresponde a ningún período de alquiler`);
        }

        const event = check.marksDamaged
          ? await tx.lifecycleEvent.create({
              data: {
                organizationId: requireOrgId(),
                toolId: tool.id,
                type: "DAMAGE",
                fromStatus: tool.status,
                toStatus: "DANADA",
                occurredAt: input.occurredAt,
                description: input.description,
                locationId: tool.currentLocationId,
                reportedById: actor.userId,
              },
            })
          : null;
        if (event) {
          await tx.tool.update({ where: { id: tool.id }, data: { status: "DANADA", statusChangedAt: input.occurredAt } });
        }

        const report = await tx.damageReport.create({
          data: {
            organizationId: requireOrgId(),
            id: input.id,
            toolId: tool.id,
            rentalId: rental?.id,
            kind: input.kind,
            condition: input.condition,
            toolStatus: tool.status,
            description: input.description,
            notes: input.notes,
            occurredAt: input.occurredAt,
            reportedById: actor.userId,
            lifecycleEventId: event?.id,
          },
        });
        await attachPhotos(tx, input.photoIds, actor.userId, { damageReportId: report.id, toolId: tool.id });

        await audit(tx, {
          actorId: actor.userId,
          action: "damage.report",
          entity: "tool",
          entityId: tool.id,
          diff: {
            reportId: report.id,
            rentalId: rental?.id ?? null,
            kind: input.kind,
            condition: input.condition,
            eventId: event?.id ?? null,
            photos: input.photoIds.length,
          },
          ip,
        });
        return report.id;
      });
      return { report: await this.get(id), created: true };
    } catch (err) {
      // Dos reintentos simultáneos: el segundo choca con la clave primaria y devuelve el del primero.
      if (isUniqueViolation(err)) {
        const winner = await this.findRetry(input, actor);
        if (winner) return { report: winner, created: false };
      }
      throw err;
    }
  }

  /** Un reporte con el mismo id ya guardado por el mismo usuario para la misma herramienta. */
  private async findRetry(input: DamageReportCreateInput, actor: AccessClaims) {
    const existing = await this.prisma.damageReport.findUnique({ where: { id: input.id }, include: DAMAGE_REPORT_INCLUDE });
    if (!existing) return null;
    if (existing.toolId !== input.toolId || existing.reportedById !== actor.userId) {
      throw AppError.conflict("ID_IN_USE", "El identificador del reporte ya está en uso");
    }
    return existing;
  }

  async get(id: string) {
    const report = await this.prisma.damageReport.findUnique({ where: { id }, include: DAMAGE_REPORT_INCLUDE });
    if (!report) throw AppError.notFound("Reporte de daño");
    return report;
  }

  /** Historial de daños de una herramienta, del más reciente al más antiguo. */
  async listForTool(toolId: string) {
    const exists = await this.prisma.tool.count({ where: { id: toolId } });
    if (!exists) throw AppError.notFound("Herramienta");
    return this.prisma.damageReport.findMany({
      where: { toolId },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      include: DAMAGE_REPORT_INCLUDE,
    });
  }
}
