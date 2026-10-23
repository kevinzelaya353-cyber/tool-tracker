import type { Prisma, PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import type { z } from "zod";
import {
  platformSuperadminUpdateSchema,
  userUpdateSchema,
  type PlatformPasswordResetInput,
  type PlatformUserCreateInput,
  type PlatformUserListQuery,
} from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { runInOrg } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";
import { ADMIN_FIELDS, assertCredential, type UsersService } from "../users/users.service.js";

const LIST_FIELDS = {
  ...ADMIN_FIELDS,
  organizationId: true,
  organization: { select: { id: true, name: true, active: true } },
} as const;

/**
 * Usuarios de toda la plataforma (solo SuperAdmin). Para los usuarios de una organización delega en
 * UsersService DENTRO de esa organización (mismas reglas que su administrador: último admin, credencial
 * según el rol…). Las cuentas SuperAdmin se gestionan aquí, con controles reforzados:
 * crear otra, desactivarla o restablecer su contraseña exige la contraseña de quien opera, y nunca
 * puede quedar la plataforma sin un SuperAdmin activo.
 */
export class PlatformUsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: Pick<TokenService, "revokeAllForUser">,
    private readonly users: UsersService,
  ) {}

  async list(q: PlatformUserListQuery) {
    const where: Prisma.UserWhereInput = {
      organizationId: q.organizationId,
      role: q.role,
      ...(q.status === "active" && { active: true, lockedAt: null }),
      ...(q.status === "inactive" && { active: false }),
      ...(q.status === "locked" && { lockedAt: { not: null } }),
      ...(q.q && {
        OR: [
          { name: { contains: q.q, mode: "insensitive" } },
          { username: { contains: q.q, mode: "insensitive" } },
          { email: { contains: q.q, mode: "insensitive" } },
        ],
      }),
    };
    const [total, data] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: [{ organization: { name: "asc" } }, { name: "asc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return { total, page: q.page, pageSize: q.pageSize, data };
  }

  async get(id: string) {
    const user = await this.load(id);
    const activeSessions = await this.prisma.refreshToken.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } });
    const passwordChangedAt = (await this.prisma.user.findUnique({ where: { id }, select: { passwordChangedAt: true } }))?.passwordChangedAt;
    return { ...user, activeSessions, passwordChangedAt };
  }

  async create(actor: AccessClaims, input: PlatformUserCreateInput, ip?: string) {
    if (input.role !== "SUPERADMIN") {
      const org = await this.prisma.organization.findUnique({ where: { id: input.organizationId! }, select: { id: true } });
      if (!org) throw AppError.notFound("Organización");
      const { organizationId, confirmPassword: _c, role, ...rest } = input;
      const created = await runInOrg(organizationId!, () => this.users.create(actor, { ...rest, role }, ip));
      return this.load(created.id);
    }

    await this.confirmActor(actor, input.confirmPassword);
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          email: input.email,
          role: "SUPERADMIN",
          organizationId: null,
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: true,
        },
        select: LIST_FIELDS,
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.create_superadmin",
        entity: "user",
        entityId: user.id,
        organizationId: null,
        diff: { name: user.name, username: user.username },
        ip,
      });
      return user;
    });
  }

  /** El cuerpo se valida según la cuenta: SuperAdmin (controles reforzados) o usuario de una organización. */
  async update(actor: AccessClaims, id: string, body: unknown, ip?: string) {
    const target = await this.load(id);
    if (target.role !== "SUPERADMIN") {
      const input = parse(userUpdateSchema, body);
      await runInOrg(target.organizationId!, () => this.users.update(actor, id, input, ip));
      return this.load(id);
    }

    const input = parse(platformSuperadminUpdateSchema, body);
    if (actor.userId === id && input.active === false) {
      throw AppError.badRequest("SELF_LOCKOUT", "No puedes desactivar tu propia cuenta");
    }
    await this.confirmActor(actor, input.confirmPassword);
    await this.prisma.$transaction(async (tx) => {
      if (input.active === false && target.active) {
        const others = await tx.user.count({ where: { role: "SUPERADMIN", active: true, id: { not: id } } });
        if (others === 0) throw AppError.conflict("LAST_SUPERADMIN", "Debe existir al menos un SuperAdmin activo");
      }
      await tx.user.update({ where: { id }, data: { name: input.name, active: input.active } });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.update_superadmin",
        entity: "user",
        entityId: id,
        organizationId: null,
        diff: {
          ...(input.name !== undefined && input.name !== target.name && { name: { from: target.name, to: input.name } }),
          ...(input.active !== undefined && input.active !== target.active && { active: { from: target.active, to: input.active } }),
        },
        ip,
      });
    }, { isolationLevel: "Serializable" });
    if (input.active === false) await this.tokens.revokeAllForUser(id);
    return this.load(id);
  }

  async resetPassword(actor: AccessClaims, id: string, input: PlatformPasswordResetInput, ip?: string) {
    const target = await this.load(id);
    if (target.role !== "SUPERADMIN") {
      await runInOrg(target.organizationId!, () => this.users.resetPassword(actor, id, input, ip));
      return this.get(id);
    }
    if (actor.userId === id) throw AppError.badRequest("USE_CHANGE_PASSWORD", "Para tu propia cuenta usa “Cambiar contraseña”");
    await this.confirmActor(actor, input.confirmPassword);
    assertCredential("SUPERADMIN", input.password);
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: input.mustChangePassword, failedLogins: 0, lockedAt: null },
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.password_reset",
        entity: "user",
        entityId: id,
        organizationId: null,
        diff: { superadmin: true, mustChangePassword: input.mustChangePassword },
        ip,
      });
    });
    await this.tokens.revokeAllForUser(id);
    return this.get(id);
  }

  async revokeSessions(actor: AccessClaims, id: string, ip?: string) {
    const target = await this.load(id);
    if (target.role !== "SUPERADMIN") {
      await runInOrg(target.organizationId!, () => this.users.revokeSessions(actor, id, ip));
    } else {
      await this.tokens.revokeAllForUser(id);
      await audit(this.prisma, { actorId: actor.userId, action: "user.revoke_sessions", entity: "user", entityId: id, organizationId: null, ip });
    }
    return this.get(id);
  }

  async remove(actor: AccessClaims, id: string, ip?: string) {
    const target = await this.load(id);
    if (target.role === "SUPERADMIN") throw AppError.badRequest("SUPERADMIN_NOT_DELETABLE", "Un SuperAdmin no se elimina: desactívalo");
    await runInOrg(target.organizationId!, () => this.users.remove(actor, id, ip));
  }

  private async load(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: LIST_FIELDS });
    if (!user) throw AppError.notFound("Usuario");
    return user;
  }

  /** Reautenticación para operaciones críticas: la contraseña de quien opera, nunca la del otro usuario. */
  private async confirmActor(actor: AccessClaims, password: string | undefined) {
    const me = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { passwordHash: true } });
    const ok = Boolean(password && me?.passwordHash && (await argon2.verify(me.passwordHash, password).catch(() => false)));
    if (!ok) {
      await audit(this.prisma, {
        actorId: actor.userId,
        action: "auth.confirm_failed",
        entity: "user",
        entityId: actor.userId,
        organizationId: null,
        result: "FAILURE",
      });
      throw AppError.forbidden("Confirma la operación con tu contraseña");
    }
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw AppError.badRequest(
      "VALIDATION_ERROR",
      "Datos inválidos",
      r.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    );
  }
  return r.data;
}
