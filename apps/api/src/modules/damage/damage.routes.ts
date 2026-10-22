import { Router } from "express";
import { z } from "zod";
import { damageReportCreateSchema, id } from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { DamageService } from "./damage.service.js";

const idParams = z.object({ id });

/**
 * Montar detrás de `authenticate`. El historial de una herramienta se consulta en
 * GET /tools/:id/damage-reports. Los reportes son de solo inserción (trigger en BD).
 */
export function damageRouter(svc: DamageService) {
  const r = Router();

  // 201 si se creó; 200 si era un reintento de un reporte ya guardado (mismo id).
  r.post("/", authorize("lifecycle:create"), validate("body", damageReportCreateSchema), async (req, res) => {
    const { report, created } = await svc.create(res.locals.body, currentUser(res), req.ip);
    res.status(created ? 201 : 200).json(report);
  });

  r.get("/:id", authorize("tools:read"), validate("params", idParams), async (_req, res) => {
    res.json(await svc.get((res.locals.params as z.infer<typeof idParams>).id));
  });

  return r;
}
