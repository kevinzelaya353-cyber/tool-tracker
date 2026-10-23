import type { PrismaClient } from "@prisma/client";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  auditQuerySchema,
  id,
  impersonationStartSchema,
  organizationCreateSchema,
  organizationUpdateSchema,
  platformPasswordResetSchema,
  platformUserCreateSchema,
  platformUserListQuerySchema,
  type AuditQuery,
  type ImpersonationStartInput,
  type OrganizationCreateInput,
  type OrganizationUpdateInput,
  type PlatformPasswordResetInput,
  type PlatformUserCreateInput,
  type PlatformUserListQuery,
} from "@tt/shared";
import { runAsPlatform } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { queryAudit } from "../audit/audit.service.js";
import type { ImpersonationService } from "./impersonation.service.js";
import type { OrganizationsService } from "./organizations.service.js";
import type { OverviewService } from "./overview.service.js";
import type { PlatformUsersService } from "./platform-users.service.js";

const idParams = z.object({ id });
const impersonationListQuery = z.object({
  active: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/**
 * Solo el SuperAdmin con su propia sesión (nunca desde una sesión de soporte: el token de una
 * impersonación lleva el rol del usuario impersonado, que nunca es SUPERADMIN). Ejecuta el resto
 * de la petición con alcance de plataforma: sin filtro por organización.
 */
const requireSuperadmin: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth;
  if (!auth) return next(AppError.unauthorized());
  if (auth.role !== "SUPERADMIN" || auth.impersonationId) return next(AppError.forbidden("Solo para el administrador de la plataforma"));
  runAsPlatform(() => next());
};

export interface PlatformDeps {
  prisma: PrismaClient;
  organizations: OrganizationsService;
  users: PlatformUsersService;
  impersonation: ImpersonationService;
  overview: OverviewService;
}

/** Montar detrás de `authenticate`, en /api/platform. */
export function platformRouter({ prisma, organizations, users, impersonation, overview }: PlatformDeps) {
  const r = Router();
  r.use(requireSuperadmin);
  const paramId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  // ---------- Tablero global ----------
  r.get("/overview", async (_req, res) => {
    res.json(await overview.overview());
  });

  // ---------- Organizaciones ----------
  const orgs = authorize("platform:organizations");
  r.get("/organizations", orgs, async (_req, res) => {
    res.json(await organizations.list());
  });
  r.post("/organizations", orgs, validate("body", organizationCreateSchema), async (req, res) => {
    res.status(201).json(await organizations.create(currentUser(res), res.locals.body as OrganizationCreateInput, req.ip));
  });
  r.get("/organizations/:id", orgs, validate("params", idParams), async (_req, res) => {
    res.json(await organizations.get(paramId(res)));
  });
  r.patch("/organizations/:id", orgs, validate("params", idParams), validate("body", organizationUpdateSchema), async (req, res) => {
    res.json(await organizations.update(currentUser(res), paramId(res), res.locals.body as OrganizationUpdateInput, req.ip));
  });

  // ---------- Usuarios de toda la plataforma ----------
  const manage = authorize("platform:users");
  r.get("/users", manage, validate("query", platformUserListQuerySchema), async (_req, res) => {
    res.json(await users.list(res.locals.query as PlatformUserListQuery));
  });
  r.post("/users", manage, validate("body", platformUserCreateSchema), async (req, res) => {
    res.status(201).json(await users.create(currentUser(res), res.locals.body as PlatformUserCreateInput, req.ip));
  });
  r.get("/users/:id", manage, validate("params", idParams), async (_req, res) => {
    res.json(await users.get(paramId(res)));
  });
  // El cuerpo depende de la cuenta (SuperAdmin u organización): lo valida el servicio.
  r.patch("/users/:id", manage, validate("params", idParams), async (req, res) => {
    res.json(await users.update(currentUser(res), paramId(res), req.body, req.ip));
  });
  r.post("/users/:id/reset-password", manage, validate("params", idParams), validate("body", platformPasswordResetSchema), async (req, res) => {
    res.json(await users.resetPassword(currentUser(res), paramId(res), res.locals.body as PlatformPasswordResetInput, req.ip));
  });
  r.post("/users/:id/revoke-sessions", manage, validate("params", idParams), async (req, res) => {
    res.json(await users.revokeSessions(currentUser(res), paramId(res), req.ip));
  });
  r.delete("/users/:id", manage, validate("params", idParams), async (req, res) => {
    await users.remove(currentUser(res), paramId(res), req.ip);
    res.status(204).end();
  });

  // ---------- Sesiones de soporte ----------
  const imp = authorize("platform:impersonate");
  r.get("/impersonations", imp, validate("query", impersonationListQuery), async (_req, res) => {
    const q = res.locals.query as z.infer<typeof impersonationListQuery>;
    res.json(await impersonation.list({ active: q.active === "true", page: q.page, pageSize: q.pageSize }));
  });
  r.post("/impersonations", imp, validate("body", impersonationStartSchema), async (req, res) => {
    res.status(201).json(await impersonation.start(currentUser(res), res.locals.body as ImpersonationStartInput, req.ip));
  });
  r.post("/impersonations/:id/revoke", imp, validate("params", idParams), async (req, res) => {
    await impersonation.revoke(currentUser(res), paramId(res), req.ip);
    res.status(204).end();
  });

  // ---------- Auditoría global ----------
  r.get("/audit", authorize("platform:audit"), validate("query", auditQuerySchema), async (_req, res) => {
    res.json(await queryAudit(prisma, res.locals.query as AuditQuery, null));
  });

  return r;
}
