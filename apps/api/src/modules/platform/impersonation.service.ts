import type { Prisma, PrismaClient } from "@prisma/client";
import type { ImpersonationStartInput } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { toSessionUser } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";

/** Duración máxima de una sesión de soporte. No se renueva: al vencer, se vuelve a la sesión del SuperAdmin. */
export const IMPERSONATION_TTL_MIN = 30;

const SESSION_INCLUDE = {
  actor: { select: { id: true, name: true, username: true } },
  target: { select: { id: true, name: true, username: true, role: true } },
  organization: { select: { id: true, name: true } },
} satisfies Prisma.ImpersonationSessionInclude;

/**
 * "Acceder como usuario" (sesión de soporte). Reglas:
 * - solo un SuperAdmin con su propia sesión (nunca desde otra impersonación: no hay cadenas);
 * - nunca hacia otro SuperAdmin, ni a cuentas inactivas o de organizaciones desactivadas;
 * - no se usa ni se revela la credencial del usuario: se emite un access token propio, sin refresh,
 *   que caduca solo y que la API valida contra esta tabla en cada petición (revocable al instante);
 * - todo lo que se haga queda auditado con el SuperAdmin como actor real.
 */
export class ImpersonationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: Pick<TokenService, "signAccess">,
    private readonly ttlMin = IMPERSONATION_TTL_MIN,
  ) {}

  async start(actor: AccessClaims, input: ImpersonationStartInput, ip?: string) {
    if (actor.role !== "SUPERADMIN" || actor.impersonationId) {
      throw AppError.forbidden("Solo un SuperAdmin, desde su propia sesión, puede acceder como otro usuario");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        role: true,
        active: true,
        passwordHash: true,
        mustChangePassword: true,
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true, currency: true, brandColor: true, active: true } },
      },
    });
    if (!target) throw AppError.notFound("Usuario");
    if (target.role === "SUPERADMIN" || !target.organizationId || !target.organization) {
      throw AppError.forbidden("No se puede acceder como otro SuperAdmin");
    }
    if (!target.active || !target.passwordHash) {
      throw AppError.conflict("USER_INACTIVE", "El usuario está inactivo o no tiene acceso a la app");
    }
    if (!target.organization.active) throw AppError.conflict("ORG_INACTIVE", "La organización del usuario está desactivada");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMin * 60_000);
    const session = await this.prisma.$transaction(async (tx) => {
      // Una sola sesión de soporte a la vez por SuperAdmin.
      await tx.impersonationSession.updateMany({
        where: { actorId: actor.userId, endedAt: null },
        data: { endedAt: now, endReason: "ENDED", endedById: actor.userId },
      });
      const s = await tx.impersonationSession.create({
        data: {
          actorId: actor.userId,
          targetUserId: target.id,
          organizationId: target.organizationId!,
          reason: input.reason,
          startedAt: now,
          expiresAt,
          ip: ip?.slice(0, 45),
        },
        include: SESSION_INCLUDE,
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "impersonation.start",
        entity: "user",
        entityId: target.id,
        organizationId: target.organizationId,
        diff: { sessionId: s.id, targetRole: target.role, reason: input.reason, expiresAt },
        ip,
      });
      return s;
    });

    const accessToken = await this.tokens.signAccess(
      // Sin la obligación de cambiar la credencial: esa es del usuario, no de quien da soporte.
      { userId: target.id, role: target.role, orgId: target.organizationId, actorId: actor.userId, impersonationId: session.id },
      this.ttlMin * 60,
    );
    const user = { ...toSessionUser(target), mustChangePassword: false };
    return {
      accessToken,
      expiresIn: this.ttlMin * 60,
      session,
      user: { ...user, impersonation: { id: session.id, actor: session.actor, reason: session.reason, expiresAt } },
    };
  }

  /** La finaliza quien la abrió, desde la propia sesión de soporte. */
  async end(claims: AccessClaims, ip?: string) {
    if (!claims.impersonationId || !claims.actorId) throw AppError.badRequest("NOT_IMPERSONATING", "No es una sesión de soporte");
    await this.close(claims.impersonationId, claims.actorId, "ENDED", ip);
  }

  /** Otro SuperAdmin (o el mismo, desde su sesión) la corta. */
  async revoke(actor: AccessClaims, id: string, ip?: string) {
    const found = await this.prisma.impersonationSession.findUnique({ where: { id }, select: { endedAt: true } });
    if (!found) throw AppError.notFound("Sesión de soporte");
    if (found.endedAt) throw AppError.conflict("ALREADY_ENDED", "La sesión de soporte ya terminó");
    await this.close(id, actor.userId, "REVOKED", ip);
  }

  private async close(id: string, byId: string, reason: "ENDED" | "REVOKED", ip?: string) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.impersonationSession.updateMany({
        where: { id, endedAt: null },
        data: { endedAt: new Date(), endReason: reason, endedById: byId },
      });
      if (count === 0) return; // ya cerrada: idempotente
      const s = await tx.impersonationSession.findUniqueOrThrow({ where: { id }, select: { organizationId: true, targetUserId: true } });
      await audit(tx, {
        actorId: byId,
        action: reason === "ENDED" ? "impersonation.end" : "impersonation.revoke",
        entity: "user",
        entityId: s.targetUserId,
        organizationId: s.organizationId,
        diff: { sessionId: id },
        ip,
      });
    });
  }

  async list(q: { active?: boolean; page: number; pageSize: number }) {
    const now = new Date();
    const where: Prisma.ImpersonationSessionWhereInput = q.active ? { endedAt: null, expiresAt: { gt: now } } : {};
    const [total, data] = await Promise.all([
      this.prisma.impersonationSession.count({ where }),
      this.prisma.impersonationSession.findMany({
        where,
        include: SESSION_INCLUDE,
        orderBy: { startedAt: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, data: data.map((s) => ({ ...s, active: !s.endedAt && s.expiresAt > now })) };
  }
}
