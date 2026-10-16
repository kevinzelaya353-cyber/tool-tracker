import type { RequestHandler, Response } from "express";
import { can, type Permission } from "@tt/shared";
import { AppError } from "../lib/errors.js";
import type { AccessClaims, TokenService } from "../modules/auth/token.service.js";

/** Exige `Authorization: Bearer <access token>` y deja los claims en res.locals.auth. */
export function authenticate(tokens: Pick<TokenService, "verifyAccess">): RequestHandler {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next(AppError.unauthorized());
    res.locals.auth = await tokens.verifyAccess(header.slice(7).trim());
    next();
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

/** Acceso tipado a los claims en un handler protegido. */
export function currentUser(res: Response): AccessClaims {
  const auth = res.locals.auth;
  if (!auth) throw AppError.unauthorized();
  return auth;
}
