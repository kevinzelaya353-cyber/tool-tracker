import type { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { ROLE_PERMISSIONS, type LoginInput, type Role } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import type { TokenPair, TokenService } from "./token.service.js";

export const ARGON2_OPTIONS = { type: argon2.argon2id } as const;

export function hashPassword(password: string) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  permissions: readonly string[];
}

export function toSessionUser(u: { id: string; name: string; email: string; role: Role }): SessionUser {
  return { id: u.id, name: u.name, email: u.email, role: u.role, permissions: ROLE_PERMISSIONS[u.role] };
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
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    this.dummyHash ??= hashPassword("dummy-password-for-timing-0");
    const hash = user?.passwordHash ?? (await this.dummyHash);

    const valid = await argon2.verify(hash, input.password).catch(() => false);
    if (!user || !valid || !user.active) {
      await audit(this.prisma, {
        actorId: user?.id ?? null,
        action: "auth.login_failed",
        entity: "user",
        entityId: user?.id ?? null,
        diff: { reason: !user ? "unknown_email" : !valid ? "bad_password" : "inactive" },
        ip,
      });
      // Mismo mensaje para todos los casos.
      throw AppError.unauthorized("Credenciales inválidas");
    }

    // needsRehash compara contra los parámetros de coste por defecto (el tipo va en el propio hash).
    if (argon2.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
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
