import type { PrismaClient } from "@prisma/client";
import { can, type PersonCreateInput, type Role, type UserCreateInput, type UserUpdateInput } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";

const PUBLIC_FIELDS = { id: true, name: true, role: true } as const;
const ADMIN_FIELDS = { ...PUBLIC_FIELDS, email: true, active: true, lastLoginAt: true, createdAt: true } as const;

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

  async create(actor: AccessClaims, input: UserCreateInput, ip?: string) {
    const passwordHash = await hashPassword(input.password);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: input.name, email: input.email, role: input.role, passwordHash },
        select: ADMIN_FIELDS,
      });
      await audit(tx, {
        actorId: actor.userId,
        action: "user.create",
        entity: "user",
        entityId: user.id,
        diff: { name: user.name, email: user.email, role: user.role },
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
    if (isSelf && (input.active === false || (input.role && input.role !== actor.role))) {
      throw AppError.badRequest("SELF_LOCKOUT", "No puedes desactivarte ni cambiar tu propio rol");
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    // Serializable: evita que dos degradaciones simultáneas dejen el sistema sin administradores.
    const updated = await this.prisma.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id }, select: ADMIN_FIELDS });
      if (!before) throw AppError.notFound("Usuario");

      const losesAdmin =
        before.role === "ADMIN" &&
        before.active &&
        (input.active === false || (input.role !== undefined && input.role !== "ADMIN"));
      if (losesAdmin) {
        const admins = await tx.user.count({ where: { role: "ADMIN", active: true } });
        if (admins <= 1) throw AppError.conflict("LAST_ADMIN", "Debe existir al menos un administrador activo");
      }

      const after = await tx.user.update({
        where: { id },
        data: {
          name: input.name,
          role: input.role as Role | undefined,
          active: input.active,
          passwordHash,
        },
        select: ADMIN_FIELDS,
      });

      const changes: Record<string, unknown> = {};
      for (const k of ["name", "role", "active"] as const) {
        if (input[k] !== undefined && before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
      }
      if (input.password) changes.password = "changed";

      await audit(tx, { actorId: actor.userId, action: "user.update", entity: "user", entityId: id, diff: changes, ip });
      return { after, changes };
    }, { isolationLevel: "Serializable" });

    // Desactivar, cambiar rol o contraseña cierra todas las sesiones del usuario:
    // en ≤15 min expira su access token y no podrá renovarlo.
    const { changes, after } = updated;
    if (changes.active || changes.role || changes.password) {
      await this.tokens.revokeAllForUser(id);
    }
    return after;
  }
}
