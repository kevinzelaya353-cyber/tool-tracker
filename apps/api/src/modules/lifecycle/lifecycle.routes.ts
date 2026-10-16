import { Router } from "express";
import { lifecycleEventCreateSchema } from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { LifecycleService } from "./lifecycle.service.js";

/**
 * Montar detrás de `authenticate`. El historial se consulta en GET /tools/:id/history.
 * Los eventos son de solo inserción (trigger en BD): un error se corrige con un evento nuevo.
 */
export function lifecycleRouter(svc: LifecycleService) {
  const r = Router();

  r.post("/", authorize("lifecycle:create"), validate("body", lifecycleEventCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(res.locals.body, currentUser(res), req.ip));
  });

  return r;
}
