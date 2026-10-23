import type { Prisma, PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { credentialSchemaFor, PASSWORD_ROLES, ROLE_PERMISSIONS, type LoginInput, type PasswordChangeInput, type Role } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { AccessClaims, TokenPair, TokenService } from "./token.service.js";

export const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(password: string) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Intentos fallidos seguidos antes de bloquear una cuenta con PIN (10.000 combinaciones posibles). */
export const MAX_FAILED_LOGINS = 5;

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  currency: string;
  brandColor: string | null;
}

export interface SessionUser {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: Role;
  permissions: readonly string[];
  /** null solo para el SuperAdmin. */
  organization: SessionOrganization | null;
  mustChangePassword: boolean;
  /** Presente solo en una sesión de soporte: quién está accediendo como este usuario. */
  impersonation?: { id: string; actor: { id: string; name: string }; reason: string; expiresAt: Date };
}

const ORG_SELECT = { id: true, name: true, slug: true, currency: true, brandColor: true, active: true } as const;
const SESSION_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  organization: { select: ORG_SELECT },
} as const;

type UserRow = Prisma.UserGetPayload<{ select: typeof SESSION_SELECT }>;

type CredentialUser = { id: string; role: Role; active: boolean; passwordHash: string | null; lockedAt: Date | null };

/**
 * Verifica un PIN o contraseña y cuenta los fallos: al llegar al límite bloquea la cuenta
 * (solo roles con PIN). Se usa al iniciar sesión, al cambiar la propia credencial y cuando quien
 * recibe un traslado escribe su PIN en el teléfono del chofer: ningún camino permite adivinar sin límite.
 * Bloqueada, ni el PIN correcto vale hasta que un administrador la desbloquee.
 */
export async function checkCredential(
  prisma: PrismaClient | Prisma.TransactionClient,
  user: CredentialUser,
  password: string,
  ip: string | undefined,
): Promise<{ valid: boolean; locked: boolean }> {
  const valid = user.passwordHash ? await argon2.verify(user.passwordHash, password).catch(() => false) : false;
  if (user.lockedAt) return { valid, locked: true };
  if (valid || !user.active || PASSWORD_ROLES.includes(user.role)) return { valid, locked: false };

  // Incremento atómico: intentos simultáneos no pueden saltarse el límite.
  const { failedLogins } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (failedLogins < MAX_FAILED_LOGINS) return { valid, locked: false };
  await prisma.user.update({ where: { id: user.id }, data: { lockedAt: new Date() } });
  await audit(prisma, { actorId: null, action: "auth.locked", entity: "user", entityId: user.id, ip, result: "FAILURE" });
  return { valid, locked: true };
}

export function toSessionUser(u: UserRow): SessionUser {
  const { active: _active, ...org } = u.organization ?? { active: true };
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    permissions: ROLE_PERMISSIONS[u.role],
    organization: u.organization ? (org as SessionOrganization) : null,
    mustChangePassword: u.mustChangePassword,
  };
}

/**
 * Inicio de sesión y credenciales propias. Usa el cliente Prisma SIN filtro por organización:
 * el usuario todavía no tiene contexto (se busca por su usuario, que es único en la plataforma).
 */
export class AuthService {
  // Hash señuelo: si el usuario no existe igual se ejecuta argon2.verify y el tiempo
  // de respuesta no revela qué cuentas existen.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
  ) {}

  async login(input: LoginInput, ip: string | undefined): Promise<TokenPair & { user: SessionUser }> {
    // Las cuentas creadas antes del usuario corto siguen entrando con su correo.
    const where = input.username.includes("@") ? { email: input.username } : { username: input.username };
    const user = await this.prisma.user.findUnique({
      where,
      select: { ...SESSION_SELECT, passwordHash: true, lockedAt: true, organizationId: true },
    });
    this.dummyHash ??= hashPassword("dummy-password-for-timing-0");
    const hash = user?.passwordHash ?? (await this.dummyHash);

    const { valid, locked } = user
      ? await checkCredential(this.prisma, user, input.password, ip)
      : { valid: await argon2.verify(hash, input.password).catch(() => false), locked: false };
    const orgInactive = Boolean(user?.organization && !user.organization.active);
    if (!user || !valid || !user.active || locked || orgInactive) {
      await audit(this.prisma, {
        actorId: user?.id ?? null,
        action: "auth.login_failed",
        entity: "user",
        entityId: user?.id ?? null,
        organizationId: user?.organizationId ?? null,
        result: "FAILURE",
        diff: {
          reason: !user ? "unknown_user" : locked ? "locked" : !valid ? "bad_password" : !user.active ? "inactive" : "org_inactive",
        },
        ip,
      });
      // Bloqueo con mensaje propio (el usuario necesita saber a quién acudir); el resto, mensaje único.
      if (locked) {
        throw new AppError(423, "ACCOUNT_LOCKED", "Cuenta bloqueada por intentos fallidos. Pide al administrador que la desbloquee.");
      }
      // Solo con la credencial correcta se revela que la organización está desactivada.
      if (user && valid && user.active && orgInactive) {
        throw new AppError(403, "ORG_INACTIVE", "Tu organización está desactivada. Contacta al administrador de la plataforma.");
      }
      throw AppError.unauthorized("Usuario o PIN incorrecto");
    }

    // needsRehash compara contra los parámetros de coste por defecto (el tipo va en el propio hash).
    if (argon2.needsRehash(hash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLogins: 0 } });
    await audit(this.prisma, {
      actorId: user.id,
      action: "auth.login",
      entity: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      ip,
    });

    const pair = await this.tokens.issue(claimsOf(user));
    return { ...pair, user: toSessionUser(user) };
  }

  async refresh(refreshToken: string, ip: string | undefined): Promise<TokenPair> {
    try {
      const { accessToken, refreshToken: next, expiresIn } = await this.tokens.rotate(refreshToken, async (id) => {
        const u = await this.prisma.user.findUnique({
          where: { id },
          select: { id: true, role: true, active: true, organizationId: true, mustChangePassword: true, organization: { select: { active: true } } },
        });
        return u && { ...u, organizationActive: u.organization ? u.organization.active : true };
      });
      return { accessToken, refreshToken: next, expiresIn };
    } catch (err) {
      if (err instanceof AppError && err.code === "REFRESH_REUSED") {
        await audit(this.prisma, {
          actorId: null,
          action: "auth.refresh_reuse_detected",
          entity: "refresh_token",
          result: "FAILURE",
          organizationId: null,
          ip,
        });
      }
      throw err;
    }
  }

  async logout(refreshToken: string, ip: string | undefined): Promise<void> {
    const userId = await this.tokens.revoke(refreshToken);
    if (!userId) return;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } });
    await audit(this.prisma, {
      actorId: userId,
      action: "auth.logout",
      entity: "user",
      entityId: userId,
      organizationId: user?.organizationId ?? null,
      ip,
    });
  }

  async me(claims: AccessClaims): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: claims.userId }, select: SESSION_SELECT });
    if (!user || !user.active) throw AppError.unauthorized();
    const session = toSessionUser(user);
    if (!claims.impersonationId) return session;
    const imp = await this.prisma.impersonationSession.findUnique({
      where: { id: claims.impersonationId },
      select: { id: true, reason: true, expiresAt: true, actor: { select: { id: true, name: true } } },
    });
    return imp ? { ...session, impersonation: imp } : session;
  }

  /**
   * Cambia la propia credencial verificando la actual (los fallos cuentan para el bloqueo de las
   * cuentas con PIN). Cierra las demás sesiones y devuelve un par nuevo para esta.
   */
  async changePassword(claims: AccessClaims, input: PasswordChangeInput, ip: string | undefined) {
    const user = await this.prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, role: true, active: true, passwordHash: true, lockedAt: true, organizationId: true },
    });
    if (!user || !user.active) throw AppError.unauthorized();
    const { valid, locked } = await checkCredential(this.prisma, user, input.currentPassword, ip);
    if (locked) throw new AppError(423, "ACCOUNT_LOCKED", "Cuenta bloqueada por intentos fallidos. Pide al administrador que la desbloquee.");
    if (!valid) {
      await audit(this.prisma, {
        actorId: user.id,
        action: "auth.password_change",
        entity: "user",
        entityId: user.id,
        organizationId: user.organizationId,
        result: "FAILURE",
        ip,
      });
      throw AppError.badRequest("BAD_CURRENT_PASSWORD", "El PIN o la contraseña actual no es correcto");
    }
    const r = credentialSchemaFor(user.role).safeParse(input.newPassword);
    if (!r.success) {
      throw AppError.badRequest(
        "VALIDATION_ERROR",
        "Datos inválidos",
        r.error.issues.map((i) => ({ path: "newPassword", message: i.message })),
      );
    }
    if (input.newPassword === input.currentPassword) {
      throw AppError.badRequest("SAME_PASSWORD", "La nueva credencial debe ser distinta de la actual");
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLogins: 0,
      },
      select: { ...SESSION_SELECT, organizationId: true },
    });
    await audit(this.prisma, {
      actorId: user.id,
      action: "auth.password_change",
      entity: "user",
      entityId: user.id,
      organizationId: user.organizationId,
      ip,
    });
    await this.tokens.revokeAllForUser(user.id);
    const pair = await this.tokens.issue(claimsOf(updated));
    return { ...pair, user: toSessionUser(updated) };
  }
}

function claimsOf(u: { id: string; role: Role; organizationId: string | null; mustChangePassword: boolean }): AccessClaims {
  return { userId: u.id, role: u.role, orgId: u.organizationId, mustChangePassword: u.mustChangePassword };
}
