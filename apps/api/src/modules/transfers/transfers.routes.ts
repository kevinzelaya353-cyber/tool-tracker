import { Router } from "express";
import { z } from "zod";
import {
  id,
  transferCreateSchema,
  transferListQuerySchema,
  transferPhotosSchema,
  type TransferListQuery,
  type TransferPhotosInput,
} from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { TransfersService } from "./transfers.service.js";

const idParams = z.object({ id });

/** Montar detrás de `authenticate`. Los traslados no se editan ni borran (son evidencia); solo se les agregan fotos. */
export function transfersRouter(svc: TransfersService) {
  const r = Router();

  r.get("/", authorize("transfers:read"), validate("query", transferListQuerySchema), async (_req, res) => {
    res.json(await svc.list(res.locals.query as TransferListQuery));
  });

  r.get("/:id", authorize("transfers:read"), validate("params", idParams), async (_req, res) => {
    res.json(await svc.get((res.locals.params as z.infer<typeof idParams>).id));
  });

  r.get("/:id/map", authorize("transfers:read"), validate("params", idParams), async (_req, res) => {
    res.json(await svc.mapImage((res.locals.params as z.infer<typeof idParams>).id));
  });

  r.post("/", authorize("transfers:create"), validate("body", transferCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(res.locals.body, { actorId: currentUser(res).userId, ip: req.ip }));
  });

  r.post(
    "/:id/photos",
    authorize("transfers:create"),
    validate("params", idParams),
    validate("body", transferPhotosSchema),
    async (req, res) => {
      const { id: transferId } = res.locals.params as z.infer<typeof idParams>;
      const body = res.locals.body as TransferPhotosInput;
      res.json(await svc.addPhotos(transferId, body, { actorId: currentUser(res).userId, ip: req.ip }));
    },
  );

  return r;
}
