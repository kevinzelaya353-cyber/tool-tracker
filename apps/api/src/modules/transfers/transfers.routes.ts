import { Router } from "express";
import { z } from "zod";
import { id, transferCreateSchema, transferListQuerySchema, type TransferListQuery } from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { TransfersService } from "./transfers.service.js";

const idParams = z.object({ id });

/** Montar detrás de `authenticate`. Los traslados no se editan ni borran: son evidencia. */
export function transfersRouter(svc: TransfersService) {
  const r = Router();

  r.get("/", authorize("transfers:read"), validate("query", transferListQuerySchema), async (_req, res) => {
    res.json(await svc.list(res.locals.query as TransferListQuery));
  });

  r.get("/:id", authorize("transfers:read"), validate("params", idParams), async (_req, res) => {
    res.json(await svc.get((res.locals.params as z.infer<typeof idParams>).id));
  });

  r.post("/", authorize("transfers:create"), validate("body", transferCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(res.locals.body, { actorId: currentUser(res).userId, ip: req.ip }));
  });

  return r;
}
