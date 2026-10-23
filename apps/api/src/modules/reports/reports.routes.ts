import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  reportDetailQuerySchema,
  reportFilterQuerySchema,
  reportRangeQuerySchema,
  type ReportDetailQuery,
  type ReportFilterQuery,
  type ReportRangeQuery,
} from "@tt/shared";
import { requireOrgId } from "../../lib/context.js";
import { AppError } from "../../lib/errors.js";
import { authorize, canSeeValues } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { defaultSeriesRange } from "./report-helpers.js";
import type { ExportService } from "./export.service.js";
import type { ReportsService } from "./reports.service.js";

const scope = z.object({ categoryId: z.string().uuid().optional(), locationId: z.string().uuid().optional() });

// La serie admite omitir el rango: por defecto, los últimos 12 meses.
const overTimeQuery = z.preprocess((raw) => {
  const q = { ...(raw as Record<string, unknown>) };
  if (!q.from && !q.to) {
    const d = defaultSeriesRange();
    q.from = d.from.toISOString();
    q.to = d.to.toISOString();
  }
  return q;
}, reportRangeQuerySchema.and(scope));

/**
 * Montar detrás de `authenticate`. Todos requieren reports:read; los que solo tienen sentido en
 * dinero (series de gasto y pérdidas) además finance:read. El resumen y el detalle de herramientas
 * responden a cualquiera con reports:read, con los montos en null si no puede verlos.
 */
export function reportsRouter(svc: ReportsService) {
  const r = Router();
  r.use(authorize("reports:read"));
  const money = authorize("finance:read");

  r.get("/summary", validate("query", reportFilterQuerySchema), async (_req, res) => {
    res.json(await svc.summary(res.locals.query as ReportFilterQuery, canSeeValues(res)));
  });

  r.get("/spend-by-category", money, validate("query", reportFilterQuerySchema), async (_req, res) => {
    res.json(await svc.byCategory(res.locals.query as ReportFilterQuery));
  });

  r.get("/spend-over-time", money, validate("query", overTimeQuery), async (_req, res) => {
    res.json(await svc.overTime(res.locals.query as ReportRangeQuery));
  });

  r.get("/losses", money, validate("query", reportFilterQuerySchema), async (_req, res) => {
    res.json(await svc.losses(res.locals.query as ReportFilterQuery));
  });

  // Registros detrás de una cifra o un elemento de gráfica (barra, segmento, indicador).
  r.get("/details", validate("query", reportDetailQuerySchema), async (_req, res) => {
    const q = res.locals.query as ReportDetailQuery;
    const values = canSeeValues(res);
    // Compras, gastos y pérdidas son cifras de dinero; el listado de herramientas por estado no.
    if (q.metric !== "tools" && !values) throw AppError.forbidden("No tienes permiso para ver información financiera");
    res.json(await svc.details(q, values));
  });

  return r;
}

/** GET /api/reports/export/inventory.xlsx: libro con una pestaña por proyecto/bodega. */
export function exportRouter(svc: ExportService, prisma: PrismaClient) {
  const r = Router();
  r.use(authorize("reports:read"));

  r.get("/inventory.xlsx", async (_req, res) => {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: requireOrgId() }, select: { currency: true, slug: true } });
    const file = await svc.inventoryWorkbook({ includeValues: canSeeValues(res), currency: org.currency });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="inventario-${org.slug}-${stamp}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file);
  });

  return r;
}
