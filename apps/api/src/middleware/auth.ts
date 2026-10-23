import type { RequestHandler, Response } from "express";
import { can, type Permission } from "@tt/shared";
import { runWithContext } from "../lib/context.js";
import { AppError } from "../lib/errors.js";
import type { AccessClaims, TokenService } from "../modules/auth/token.service.js";

/** Cabecera con la que el SuperAdmin elige en qué organización opera. Para el resto se ignora si coincide y se rechaza si no. */
export const ORG_HEADER = "x-org-id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Rutas que sigue pudiendo usar quien debe cambiar su credencial. */
const PASSWORD_CHANGE_PATHS = new Set(["/api/auth/me", "/api/auth/change-password", "/api/auth/impersonation/end"]);

/** Comprobaciones de estado que no caben en el token (cambian antes de que caduque). */
export interface SessionGuard {
  organizationActive(orgId: string): Promise<boolean>;
  organizationExists(orgId: string): Promise<boolean>;
  impersonationActive(impersonationId: string): Promise<boolean>;
}

/**
 * Exige `Authorization: Bearer <access token>`, deja los claims en res.locals.auth y ejecuta el
 * resto de la petición dentro de su contexto (organización, usuario real y efectivo).
 * La organización sale SIEMPRE del token; solo el SuperAdmin puede elegir otra con X-Org-Id.
 */
export function authenticate(tokens: Pick<TokenService, "verifyAccess">, guard?: SessionGuard): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next(AppError.unauthorized());
    const claims = await tokens.verifyAccess(header.slice(7).trim());
    res.locals.auth = claims;

    const requested = req.get(ORG_HEADER)?.trim() || undefined;
    let orgId = claims.orgId;
    if (claims.role === "SUPERADMIN") {
      if (requested) {
        if (!UUID_RE.test(requested) || (guard && !(await guard.organizationExists(requested)))) {
          throw AppError.notFound("Organización");
        }
        orgId = requested;
      }
    } else {
      if (requested && requested !== claims.orgId) {
        throw new AppError(403, "ORG_MISMATCH", "No tienes acceso a esa organización");
      }
      if (guard && claims.orgId && !(await guard.organizationActive(claims.orgId))) {
        throw new AppError(403, "ORG_INACTIVE", "Tu organización está desactivada. Contacta al administrador de la plataforma.");
      }
    }

    if (claims.impersonationId && guard && !(await guard.impersonationActive(claims.impersonationId))) {
      throw new AppError(401, "IMPERSONATION_ENDED", "La sesión de soporte terminó");
    }
    if (claims.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(req.originalUrl.split("?")[0]!)) {
      throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Debes cambiar tu PIN o contraseña antes de continuar");
    }

    runWithContext(
      {
        orgId,
        platform: false,
        userId: claims.userId,
        actorId: claims.actorId ?? claims.userId,
        impersonationId: claims.impersonationId,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      },
      () => next(),
    );
  };
}

/** Exige TODOS los permisos indicados. Debe ir después de `authenticate`. */
export function authorize(...permissions: Permission[]): RequestHandler {
  return (_req, res, next) => {
    const auth = res.locals.auth;
    if (!auth) return next(AppError.unauthorized());
    if (!permissions.every((p) => can(auth.role, p))) return next(AppError.forbidden());
    next();
  };
}

/** Exige AL MENOS UNO de los permisos indicados. Debe ir después de `authenticate`. */
export function authorizeAny(...permissions: Permission[]): RequestHandler {
  return (_req, res, next) => {
    const auth = res.locals.auth;
    if (!auth) return next(AppError.unauthorized());
    if (!permissions.some((p) => can(auth.role, p))) return next(AppError.forbidden());
    next();
  };
}

/** Operaciones sensibles (cuentas y credenciales) que no se hacen desde una sesión de soporte. */
export const forbidDuringImpersonation: RequestHandler = (_req, res, next) => {
  if (res.locals.auth?.impersonationId) {
    return next(new AppError(403, "IMPERSONATION_FORBIDDEN", "Esta operación no está permitida durante una sesión de soporte"));
  }
  next();
};

/** Acceso tipado a los claims en un handler protegido. */
export function currentUser(res: Response): AccessClaims {
  const auth = res.locals.auth;
  if (!auth) throw AppError.unauthorized();
  return auth;
}

/** ¿Puede ver valores monetarios? Se usa para quitar precios y costos de las respuestas. */
export const canSeeValues = (res: Response) => can(currentUser(res).role, "finance:read");
