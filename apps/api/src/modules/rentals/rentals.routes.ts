import { Router } from "express";
import { z } from "zod";
import { id, rentalCreateSchema, rentalListQuerySchema, rentalReturnSchema, type RentalListQuery } from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { RentalsService } from "./rentals.service.js";

const idParams = z.object({ id });

/**
 * Montar detrás de `authenticate`. Recibir y devolver herramientas rentadas es trabajo de bodega
 * (mismo permiso que dar de alta herramientas); las incidencias van por /damage-reports.
 */
export function rentalsRouter(svc: RentalsService) {
  const r = Router();
  const read = authorize("tools:read");
  const write = authorize("tools:write");
  const rentalId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  r.get("/", read, validate("query", rentalListQuerySchema), async (_req, res) => {
    res.json(await svc.list(res.locals.query as RentalListQuery));
  });

  r.get("/:id", read, validate("params", idParams), async (_req, res) => {
    res.json(await svc.get(rentalId(res)));
  });

  // 201 si se creó; 200 si era un reintento (mismo id).
  r.post("/", write, validate("body", rentalCreateSchema), async (req, res) => {
    const { rental, created } = await svc.create(res.locals.body, currentUser(res), req.ip);
    res.status(created ? 201 : 200).json(rental);
  });

  r.post("/:id/return", write, validate("params", idParams), validate("body", rentalReturnSchema), async (req, res) => {
    const { rental, created } = await svc.returnRental(rentalId(res), res.locals.body, currentUser(res), req.ip);
    res.status(created ? 201 : 200).json(rental);
  });

  return r;
}
