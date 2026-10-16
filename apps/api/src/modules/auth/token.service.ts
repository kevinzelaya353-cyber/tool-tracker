import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ROLE, type Role } from "@tt/shared";
import { AppError } from "../../lib/errors.js";

const ISSUER = "tool-tracker-api";
const AUDIENCE = "tool-tracker-app";

export interface AccessClaims {
  userId: string;
  role: Role;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  family: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/** Persistencia de refresh tokens. La implementación real está en refresh-store.prisma.ts. */
export interface RefreshTokenStore {
  findByHash(tokenHash: string): Promise<StoredRefreshToken | null>;
  create(data: { userId: string; tokenHash: string; family: string; expiresAt: Date }): Promise<void>;
  /** Revoca solo si sigue activo. Devuelve false si ya estaba revocado (carrera o reutilización). */
  revokeIfActive(id: string): Promise<boolean>;
  revokeFamily(family: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos de vida del access token
}

export interface TokenServiceConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtlMin: number;
  refreshTtlDays: number;
}

const reused = () => new AppError(401, "REFRESH_REUSED", "Sesión revocada");

export class TokenService {
  private readonly accessKey: Uint8Array;

  constructor(
    private readonly cfg: TokenServiceConfig,
    private readonly store: RefreshTokenStore,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.accessKey = new TextEncoder().encode(cfg.accessSecret);
  }

  async signAccess(claims: AccessClaims): Promise<string> {
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(this.now())
      .setExpirationTime(new Date(this.now().getTime() + this.cfg.accessTtlMin * 60_000))
      .sign(this.accessKey);
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.accessKey, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ["HS256"],
        currentDate: this.now(),
      });
      const role = payload.role;
      if (typeof payload.sub !== "string" || !ROLE.includes(role as Role)) throw new Error("claims");
      return { userId: payload.sub, role: role as Role };
    } catch {
      throw AppError.unauthorized("Token inválido o expirado");
    }
  }

  /** Emite un par nuevo. `family` agrupa todos los refresh tokens de una misma sesión. */
  async issue(claims: AccessClaims, family: string = randomUUID()): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + this.cfg.refreshTtlDays * 86_400_000);
    await this.store.create({ userId: claims.userId, tokenHash: this.hash(refreshToken), family, expiresAt });
    return {
      accessToken: await this.signAccess(claims),
      refreshToken,
      expiresIn: this.cfg.accessTtlMin * 60,
    };
  }

  /**
   * Rotación: cada refresh token se usa una sola vez. Si llega uno ya usado,
   * asumimos robo y revocamos toda la sesión (familia).
   * `loadUser` permite rechazar usuarios desactivados y leer su rol actual.
   */
  async rotate(
    refreshToken: string,
    loadUser: (userId: string) => Promise<{ id: string; role: Role; active: boolean } | null>,
  ): Promise<TokenPair & { userId: string }> {
    const stored = await this.store.findByHash(this.hash(refreshToken));
    if (!stored) throw AppError.unauthorized("Sesión inválida");

    if (stored.revokedAt) {
      await this.store.revokeFamily(stored.family);
      throw reused();
    }
    if (stored.expiresAt <= this.now()) throw AppError.unauthorized("Sesión expirada");

    if (!(await this.store.revokeIfActive(stored.id))) {
      await this.store.revokeFamily(stored.family);
      throw reused();
    }

    const user = await loadUser(stored.userId);
    if (!user || !user.active) {
      await this.store.revokeFamily(stored.family);
      throw AppError.unauthorized("Usuario inactivo");
    }

    const pair = await this.issue({ userId: user.id, role: user.role }, stored.family);
    return { ...pair, userId: user.id };
  }

  /** Cierra la sesión del token dado. Idempotente: no revela si el token existía. */
  async revoke(refreshToken: string): Promise<string | null> {
    const stored = await this.store.findByHash(this.hash(refreshToken));
    if (!stored) return null;
    await this.store.revokeFamily(stored.family);
    return stored.userId;
  }

  revokeAllForUser(userId: string) {
    return this.store.revokeAllForUser(userId);
  }

  /** HMAC con secreto: una fuga de la tabla no permite validar tokens sin el secreto. */
  private hash(token: string): string {
    return createHmac("sha256", this.cfg.refreshSecret).update(token).digest("hex");
  }
}
