import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { auditQuerySchema, type AuditQuery } from "@tt/shared";
import { requireOrgId } from "../../lib/context.js";
import { authorize } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { queryAudit } from "./audit.service.js";

/**
 * Montar detrás de `authenticate`. Auditoría de la organización del contexto (nunca de otra:
 * el filtro `organizationId` de la consulta se ignora aquí). Solo lectura: el log no se edita por API.
 */
export function auditRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/", authorize("audit:read"), validate("query", auditQuerySchema), async (_req, res) => {
    res.json(await queryAudit(prisma, res.locals.query as AuditQuery, requireOrgId()));
  });

  return r;
}
