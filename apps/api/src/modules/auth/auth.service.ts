import type { Prisma, PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { ROLE_PERMISSIONS, type LoginInput, type Role } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { TokenPair, TokenService } from "./token.service.js";

export const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(password: string) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/** Intentos fallidos seguidos antes de bloquear una cuenta con PIN (10.000 combinaciones posibles). */
export const MAX_FAILED_LOGINS = 5;

export interface SessionUser {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: Role;
  permissions: readonly string[];
}

type UserRow = { id: string; name: string; username: string | null; email: string | null; role: Role };

type CredentialUser = { id: string; role: Role; active: boolean; passwordHash: string | null; lockedAt: Date | null };

/**
 * Verifica un PIN o contraseña y cuenta los fallos: al llegar al límite bloquea la cuenta
 * (solo roles con PIN). Se usa al iniciar sesión y cuando quien recibe un traslado escribe
 * su PIN en el teléfono del chofer, así ninguno de los dos caminos permite adivinar sin límite.
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
  if (valid || !user.active || user.role === "ADMIN") return { valid, locked: false };

  // Incremento atómico: intentos simultáneos no pueden saltarse el límite.
  const { failedLogins } = await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: { increment: 1 } },
    select: { failedLogins: true },
  });
  if (failedLogins < MAX_FAILED_LOGINS) return { valid, locked: false };
  await prisma.user.update({ where: { id: user.id }, data: { lockedAt: new Date() } });
  await audit(prisma, { actorId: null, action: "auth.locked", entity: "user", entityId: user.id, ip });
  return { valid, locked: true };
}

export function toSessionUser(u: UserRow): SessionUser {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    permissions: ROLE_PERMISSIONS[u.role],
  };
}

export class AuthService {
  // Hash señuelo: si el email no existe igual se ejecuta argon2.verify y el tiempo
  // de respuesta no revela qué cuentas existen.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: TokenService,
  ) {}

  async login(input: LoginInput, ip: string | undefined): Promise<TokenPair & { user: SessionUser }> {
    // Las cuentas creadas antes del usuario corto siguen entrando con su correo.
    const where = input.username.includes("@") ? { email: input.username } : { username: input.username };
    const user = await this.prisma.user.findUnique({ where });
    this.dummyHash ??= hashPassword("dummy-password-for-timing-0");
    const hash = user?.passwordHash ?? (await this.dummyHash);

    const { valid, locked } = user
      ? await checkCredential(this.prisma, user, input.password, ip)
      : { valid: await argon2.verify(hash, input.password).catch(() => false), locked: false };
    if (!user || !valid || !user.active || locked) {
      await audit(this.prisma, {
        actorId: user?.id ?? null,
        action: "auth.login_failed",
        entity: "user",
        entityId: user?.id ?? null,
        diff: { reason: !user ? "unknown_user" : locked ? "locked" : !valid ? "bad_password" : "inactive" },
        ip,
      });
      // Bloqueo con mensaje propio (el usuario necesita saber a quién acudir); el resto, mensaje único.
      if (locked) {
        throw new AppError(423, "ACCOUNT_LOCKED", "Cuenta bloqueada por intentos fallidos. Pide al administrador que la desbloquee.");
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
    await audit(this.prisma, { actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, ip });

    const pair = await this.tokens.issue({ userId: user.id, role: user.role });
    return { ...pair, user: toSessionUser(user) };
  }

  async refresh(refreshToken: string, ip: string | undefined): Promise<TokenPair> {
    try {
      const { accessToken, refreshToken: next, expiresIn } = await this.tokens.rotate(refreshToken, (id) =>
        this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, active: true } }),
      );
      return { accessToken, refreshToken: next, expiresIn };
    } catch (err) {
      if (err instanceof AppError && err.code === "REFRESH_REUSED") {
        await audit(this.prisma, {
          actorId: null,
          action: "auth.refresh_reuse_detected",
          entity: "refresh_token",
          ip,
        });
      }
      throw err;
    }
  }

  async logout(refreshToken: string, ip: string | undefined): Promise<void> {
    const userId = await this.tokens.revoke(refreshToken);
    if (userId) await audit(this.prisma, { actorId: userId, action: "auth.logout", entity: "user", entityId: userId, ip });
  }

  async me(userId: string): Promise<SessionUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw AppError.unauthorized();
    return toSessionUser(user);
  }
}
