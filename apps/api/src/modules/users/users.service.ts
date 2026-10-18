import type { PrismaClient } from "@prisma/client";
import { can, credentialSchemaFor, type PersonCreateInput, type Role, type UserCreateInput, type UserUpdateInput } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";

// defaultVehicleId: el traslado preselecciona el vehículo del chofer elegido.
const PUBLIC_FIELDS = { id: true, name: true, role: true, defaultVehicleId: true } as const;
const ADMIN_FIELDS = {
  ...PUBLIC_FIELDS,
  username: true,
  email: true,
  active: true,
  lockedAt: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** PIN para roles de campo, contraseña completa para ADMIN (el rol puede cambiar en la misma petición). */
function assertCredential(role: Role, password: string) {
  const r = credentialSchemaFor(role).safeParse(password);
  if (!r.success) {
    throw AppError.badRequest(
      "VALIDATION_ERROR",
      "Datos inválidos",
      r.error.issues.map((i) => ({ path: "password", message: i.message })),
    );
  }
}

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
        data: {
          name: input.name,
          username: input.username,
          email: input.email,
          role: input.role,
          passwordHash,
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
    if (isSelf && (input.active === false || (input.role && input.role !== actor.role))) {
      throw AppError.badRequest("SELF_LOCKOUT", "No puedes desactivarte ni cambiar tu propio rol");
    }

    const passwordHash = input.password ? await hashPassword(input.password) : undefined;

    // Serializable: evita que dos degradaciones simultáneas dejen el sistema sin administradores.
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
      } else if (hasAccess && (role === "ADMIN") !== (before.role === "ADMIN")) {
        // Un PIN no basta para un administrador, ni la contraseña de admin debe quedar en un rol de campo.
        throw AppError.badRequest(
          "CREDENTIAL_REQUIRED",
          role === "ADMIN" ? "Asigna una contraseña completa al nuevo administrador" : "Asigna un PIN de 4 dígitos para el nuevo rol",
        );
      } else if (input.username && !hasAccess) {
        throw AppError.badRequest("CREDENTIAL_REQUIRED", "Asigna un PIN para que pueda iniciar sesión");
      }

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
          username: input.username,
          role: input.role as Role | undefined,
          active: input.active,
          passwordHash,
          defaultVehicleId: input.defaultVehicleId,
          // Un PIN nuevo también desbloquea.
          ...((input.unlock || passwordHash) && { failedLogins: 0, lockedAt: null }),
        },
        select: ADMIN_FIELDS,
      });

      const changes: Record<string, unknown> = {};
      for (const k of ["name", "username", "role", "active", "defaultVehicleId"] as const) {
        if (input[k] !== undefined && before[k] !== after[k]) changes[k] = { from: before[k], to: after[k] };
      }
      if (input.password) changes.password = "changed";
      if (before.lockedAt && !after.lockedAt) changes.unlocked = true;

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
