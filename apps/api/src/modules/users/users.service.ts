import { Prisma, type PrismaClient } from "@prisma/client";
import {
  can,
  credentialSchemaFor,
  PASSWORD_ROLES,
  type PasswordResetInput,
  type PersonCreateInput,
  type Role,
  type UserCreateInput,
  type UserUpdateInput,
} from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";

// defaultVehicleId: el traslado preselecciona el vehículo del chofer elegido.
const PUBLIC_FIELDS = { id: true, name: true, role: true, defaultVehicleId: true } as const;
export const ADMIN_FIELDS = {
  ...PUBLIC_FIELDS,
  username: true,
  email: true,
  active: true,
  lockedAt: true,
  failedLogins: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const usesPassword = (role: Role) => PASSWORD_ROLES.includes(role);

/** PIN para roles de campo, contraseña completa para administradores (el rol puede cambiar en la misma petición). */
export function assertCredential(role: Role, password: string) {
  const r = credentialSchemaFor(role).safeParse(password);
  if (!r.success) {
    throw AppError.badRequest(
      "VALIDATION_ERROR",
      "Datos inválidos",
      r.error.issues.map((i) => ({ path: "password", message: i.message })),
    );
  }
}

/**
 * Usuarios de UNA organización: el cliente Prisma recibido filtra por la organización del contexto,
 * así que un id de otra organización (o de un SuperAdmin, que no tiene) responde 404.
 */
export class UsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: Pick<TokenService, "revokeAllForUser">,
  ) {}

  /** Quien no gestiona usuarios solo ve lo necesario para elegir "recibido por". */
  list(actor: AccessClaims, opts: { includeInactive?: boolean } = {}) {
    const isManager = can(actor.role, "users:manage");
    return this.prisma.user.findMany({
      where: isManager && opts.includeInactive ? {} : { active: true },
      select: isManager ? ADMIN_FIELDS : PUBLIC_FIELDS,
      orderBy: { name: "asc" },
    });
  }

  /** Estado de la cuenta (nunca la credencial): bloqueo, intentos, último ingreso y sesiones abiertas. */
  async get(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { ...ADMIN_FIELDS, passwordChangedAt: true } });
    if (!user) throw AppError.notFound("Usuario");
    const activeSessions = await this.prisma.refreshToken.count({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    return { ...user, activeSessions };
  }

  async create(actor: AccessClaims, input: UserCreateInput, ip?: string) {
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          username: input.username,
          email: input.email,
          role: input.role,
          passwordHash,
          passwordChangedAt: new Date(),
          defaultVehicleId: input.defaultVehicleId ?? null,
        },
        select: ADMIN_FIELDS,
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.create",
        entity: "user",
        entityId: user.id,
        diff: { name: user.name, username: user.username, role: user.role },
        ip,
      });
      return user;
    });
  }

  /** Sin correo ni contraseña: no puede iniciar sesión. */
  createPerson(actor: AccessClaims, input: PersonCreateInput, ip?: string) {
    return this.prisma.$transaction(async (tx) => {
      const person = await tx.user.create({ data: { name: input.name, role: "LECTOR" }, select: PUBLIC_FIELDS });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.create_person",
        entity: "user",
        entityId: person.id,
        diff: { name: person.name },
        ip,
      });
      return person;
    });
  }

  async update(actor: AccessClaims, id: string, input: UserUpdateInput, ip?: string) {
    const isSelf = actor.userId === id;
    if (isSelf && (input.active === false || input.lock || (input.role && input.role !== actor.role))) {
      throw AppError.badRequest("SELF_LOCKOUT", "No puedes desactivarte, bloquearte ni cambiar tu propio rol");
    }
    if (input.lock && input.unlock) throw AppError.badRequest("VALIDATION_ERROR", "Elige bloquear o desbloquear, no ambos");

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    // Serializable: evita que dos degradaciones simultáneas dejen la organización sin administradores.
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: { ...ADMIN_FIELDS, passwordHash: true } });
      if (!before) throw AppError.notFound("Usuario");

      const role = input.role ?? before.role;
      const hasAccess = before.passwordHash !== null;
      if (input.password) {
        assertCredential(role, input.password);
        if (!before.username && !before.email && !input.username) {
          throw AppError.badRequest("USERNAME_REQUIRED", "Asigna un usuario para que pueda iniciar sesión");
        }
      } else if (hasAccess && usesPassword(role) !== usesPassword(before.role)) {
        // Un PIN no basta para un administrador, ni la contraseña de admin debe quedar en un rol de campo.
        throw AppError.badRequest(
          "CREDENTIAL_REQUIRED",
          usesPassword(role) ? "Asigna una contraseña completa al nuevo administrador" : "Asigna un PIN de 4 dígitos para el nuevo rol",
        );
      } else if (input.username && !hasAccess) {
        throw AppError.badRequest("CREDENTIAL_REQUIRED", "Asigna un PIN para que pueda iniciar sesión");
      }

      const losesAdmin =
        before.role === "ADMIN" &&
        before.active &&
        !before.lockedAt &&
        (input.active === false || input.lock || (input.role !== undefined && input.role !== "ADMIN"));
      if (losesAdmin) await assertAnotherAdmin(tx, id);

      const after = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          username: input.username,
          role: input.role as Role | undefined,
          active: input.active,
          passwordHash,
          defaultVehicleId: input.defaultVehicleId,
          mustChangePassword: input.mustChangePassword,
          ...(passwordHash && { passwordChangedAt: new Date() }),
          // Un PIN nuevo también desbloquea.
          ...((input.unlock || passwordHash) && { failedLogins: 0, lockedAt: null }),
          ...(input.lock && { lockedAt: before.lockedAt ?? new Date() }),
        },
        select: ADMIN_FIELDS,
      });

      const changes: Record<string, unknown> = {};
      for (const k of ["name", "username", "role", "active", "defaultVehicleId", "mustChangePassword"] as const) {
        if (input[k] !== undefined && before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
      }
      if (input.password) changes.password = "changed";
      if (before.lockedAt && !after.lockedAt) changes.unlocked = true;
      if (!before.lockedAt && after.lockedAt) changes.locked = true;

      await audit(tx, { actorId: actor.userId, action: "user.update", entity: "user", entityId: id, diff: changes, ip });
      return { after, changes };
    }, { isolationLevel: "Serializable" });

    // Desactivar, bloquear, cambiar rol o contraseña cierra todas las sesiones del usuario:
    // en ≤15 min expira su access token y no podrá renovarlo.
    const { changes, after } = updated;
    if (changes.active || changes.role || changes.password || changes.locked) {
      await this.tokens.revokeAllForUser(id);
    }
    return after;
  }

  /**
   * Restablece el PIN o la contraseña de otro usuario (la anterior nunca se consulta). Por defecto
   * debe cambiarla al entrar. Desbloquea la cuenta y cierra todas sus sesiones.
   */
  async resetPassword(actor: AccessClaims, id: string, input: PasswordResetInput, ip?: string) {
    if (actor.userId === id) throw AppError.badRequest("USE_CHANGE_PASSWORD", "Para tu propia cuenta usa “Cambiar contraseña”");
    const user = await this.prisma.user.findUnique({ where: { id }, select: { role: true, username: true, email: true } });
    if (!user) throw AppError.notFound("Usuario");
    if (!user.username && !user.email) {
      throw AppError.badRequest("USERNAME_REQUIRED", "Asigna un usuario para que pueda iniciar sesión");
    }
    assertCredential(user.role, input.password);
    const passwordHash = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          passwordChangedAt: new Date(),
          mustChangePassword: input.mustChangePassword,
          failedLogins: 0,
          lockedAt: null,
        },
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.password_reset",
        entity: "user",
        entityId: id,
        diff: { mustChangePassword: input.mustChangePassword },
        ip,
      });
    });
    await this.tokens.revokeAllForUser(id);
    return this.get(id);
  }

  /** Cierra todas las sesiones abiertas del usuario (sus refresh tokens dejan de servir). */
  async revokeSessions(actor: AccessClaims, id: string, ip?: string) {
    const exists = await this.prisma.user.count({ where: { id } });
    if (!exists) throw AppError.notFound("Usuario");
    await this.tokens.revokeAllForUser(id);
    await audit(this.prisma, { actorId: actor.userId, action: "user.revoke_sessions", entity: "user", entityId: id, ip });
    return this.get(id);
  }

  /**
   * Elimina un usuario solo si nunca dejó rastro (sin movimientos, fotos, sesiones ni auditoría a su
   * nombre). Con historial se desactiva: borrarlo rompería la trazabilidad.
   */
  async remove(actor: AccessClaims, id: string, ip?: string) {
    if (actor.userId === id) throw AppError.badRequest("SELF_LOCKOUT", "No puedes eliminar tu propia cuenta");
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id }, select: { role: true, active: true, name: true, lockedAt: true } });
      if (!user) throw AppError.notFound("Usuario");
      if (user.role === "ADMIN" && user.active && !user.lockedAt) await assertAnotherAdmin(tx, id);
      const traces = await tx.auditLog.count({ where: { OR: [{ actorId: id }, { effectiveUserId: id }] } });
      if (traces > 0) throw hasHistory();
      try {
        await tx.refreshToken.deleteMany({ where: { userId: id } });
        await tx.user.delete({ where: { id } });
      } catch (err) {
        // Restricción de la BD: aparece en traslados, eventos, fotos o reportes.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") throw hasHistory();
        throw err;
      }
      await audit(tx, { actorId: actor.userId, action: "user.delete", entity: "user", entityId: id, diff: { name: user.name, role: user.role }, ip });
    }, { isolationLevel: "Serializable" });
  }
}

const hasHistory = () =>
  AppError.conflict("USER_HAS_HISTORY", "El usuario tiene historial (movimientos, fotos o auditoría): desactívalo en lugar de eliminarlo");

/** Debe quedar otro administrador activo y sin bloquear en la organización. */
async function assertAnotherAdmin(tx: Prisma.TransactionClient, exceptId: string) {
  const others = await tx.user.count({ where: { role: "ADMIN", active: true, lockedAt: null, id: { not: exceptId } } });
  if (others === 0) throw AppError.conflict("LAST_ADMIN", "Debe existir al menos un administrador activo en la organización");
}
