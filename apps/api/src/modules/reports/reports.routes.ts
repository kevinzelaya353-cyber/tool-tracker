import { Router } from "express";
import { z } from "zod";
import { reportFilterQuerySchema, reportRangeQuerySchema, type ReportFilterQuery, type ReportRangeQuery } from "@tt/shared";
import { authorize } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { defaultSeriesRange } from "./report-helpers.js";
import type { ExportService } from "./export.service.js";
import type { ReportsService } from "./reports.service.js";

// La serie admite omitir el rango: por defecto, los últimos 12 meses.
const overTimeQuery = z.preprocess((raw) => {
  const q = { ...(raw as Record<string, unknown>) };
  if (!q.from && !q.to) {
    const d = defaultSeriesRange();
    q.from = d.from.toISOString();
    q.to = d.to.toISOString();
  }
  return q;
}, reportRangeQuerySchema);

/** Montar detrás de `authenticate`. Todos requieren reports:read. */
export function reportsRouter(svc: ReportsService) {
  const r = Router();
  r.use(authorize("reports:read"));

  r.get("/summary", async (_req, res) => {
    res.json(await svc.summary());
  });

  r.get("/spend-by-category", validate("query", reportFilterQuerySchema), async (_req, res) => {
    res.json(await svc.byCategory(res.locals.query as ReportFilterQuery));
  });

  r.get("/spend-over-time", validate("query", overTimeQuery), async (_req, res) => {
    res.json(await svc.overTime(res.locals.query as ReportRangeQuery));
  });

  r.get("/losses", validate("query", reportFilterQuerySchema), async (_req, res) => {
    res.json(await svc.losses(res.locals.query as ReportFilterQuery));
  });

  return r;
}

/** GET /api/reports/export/inventory.xlsx: libro con una pestaña por proyecto/bodega. */
export function exportRouter(svc: ExportService) {
  const r = Router();
  r.use(authorize("reports:read"));

  r.get("/inventory.xlsx", async (_req, res) => {
    const file = await svc.inventoryWorkbook();
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="inventario-${stamp}.xlsx"`);
    res.setHeader("Cache-Control", "no-store");
    res.send(file);
  });

  return r;
}
