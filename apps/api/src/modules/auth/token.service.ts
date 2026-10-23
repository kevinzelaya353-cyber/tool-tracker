import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { ROLE, type Role } from "@tt/shared";
import { AppError } from "../../lib/errors.js";

const ISSUER = "tool-tracker-api";
const AUDIENCE = "tool-tracker-app";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AccessClaims {
  /** Usuario efectivo (en una sesión de soporte, el impersonado). */
  userId: string;
  role: Role;
  /** Organización del usuario; null solo para el SuperAdmin. */
  orgId: string | null;
  /** Debe cambiar su credencial antes de usar el resto de la API. */
  mustChangePassword?: boolean;
  /** Sesión de soporte: el SuperAdmin que la abrió y el id de la sesión. */
  actorId?: string;
  impersonationId?: string;
}

/** Lo mínimo para emitir un par nuevo al rotar (rol, organización y estado actuales). */
export interface TokenSubject {
  id: string;
  role: Role;
  active: boolean;
  organizationId: string | null;
  mustChangePassword?: boolean;
  /** false si su organización está desactivada. */
  organizationActive?: boolean;
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

  /**
   * `ttlSec`: vida propia del token (sesiones de soporte, que no tienen refresh token y se
   * validan contra la BD en cada petición). Por defecto, ACCESS_TTL_MIN.
   */
  async signAccess(claims: AccessClaims, ttlSec?: number): Promise<string> {
    const ttl = (ttlSec ?? this.cfg.accessTtlMin * 60) * 1000;
    return new SignJWT({
      role: claims.role,
      org: claims.orgId,
      ...(claims.mustChangePassword && { mcp: true }),
      ...(claims.impersonationId && { act: claims.actorId, imp: claims.impersonationId }),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(this.now())
      .setExpirationTime(new Date(this.now().getTime() + ttl))
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
      const role = payload.role as Role;
      if (typeof payload.sub !== "string" || !ROLE.includes(role)) throw new Error("claims");
      // Tokens emitidos antes de las organizaciones no traen `org`: se rechazan y la app renueva el par.
      const org = payload.org;
      if (!(org === null || (typeof org === "string" && UUID_RE.test(org)))) throw new Error("org");
      // Coherencia: solo el SuperAdmin existe sin organización.
      if ((role === "SUPERADMIN") !== (org === null)) throw new Error("org");
      const claims: AccessClaims = { userId: payload.sub, role, orgId: org };
      if (payload.mcp === true) claims.mustChangePassword = true;
      if (payload.imp !== undefined) {
        if (typeof payload.imp !== "string" || typeof payload.act !== "string" || role === "SUPERADMIN") throw new Error("imp");
        claims.impersonationId = payload.imp;
        claims.actorId = payload.act;
      }
      return claims;
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
   * `loadUser` permite rechazar usuarios desactivados y leer su rol y organización actuales.
   */
  async rotate(
    refreshToken: string,
    loadUser: (userId: string) => Promise<TokenSubject | null>,
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
    if (!user || !user.active || user.organizationActive === false) {
      await this.store.revokeFamily(stored.family);
      throw AppError.unauthorized(user?.organizationActive === false ? "Organización desactivada" : "Usuario inactivo");
    }

    const pair = await this.issue(
      { userId: user.id, role: user.role, orgId: user.organizationId, mustChangePassword: user.mustChangePassword },
      stored.family,
    );
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
