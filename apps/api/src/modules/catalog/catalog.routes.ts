import { Router } from "express";
import { z } from "zod";
import {
  catalogListQuerySchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  id,
  locationCreateSchema,
  locationUpdateSchema,
  vehicleCreateSchema,
  vehicleUpdateSchema,
  type CatalogListQuery,
} from "@tt/shared";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { CatalogService } from "./catalog.service.js";

const idParams = z.object({ id });

/** Monta /categories, /locations y /vehicles. Debe ir detrás de `authenticate`. */
export function catalogRouter(svc: CatalogService) {
  const r = Router();
  const read = authorize("tools:read");
  const write = authorize("catalog:write");
  const ctx = (req: { ip?: string }, res: Parameters<typeof currentUser>[0]) => ({
    actorId: currentUser(res).userId,
    ip: req.ip,
  });
  const paramId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  // Categorías
  r.get("/categories", read, async (_req, res) => {
    res.json(await svc.listCategories());
  });
  r.post("/categories", write, validate("body", categoryCreateSchema), async (req, res) => {
    res.status(201).json(await svc.createCategory(res.locals.body, ctx(req, res)));
  });
  r.patch("/categories/:id", write, validate("params", idParams), validate("body", categoryUpdateSchema), async (req, res) => {
    res.json(await svc.renameCategory(paramId(res), res.locals.body, ctx(req, res)));
  });

  // Ubicaciones
  r.get("/locations", read, validate("query", catalogListQuerySchema), async (_req, res) => {
    res.json(await svc.listLocations(res.locals.query as CatalogListQuery));
  });
  r.post("/locations", write, validate("body", locationCreateSchema), async (req, res) => {
    res.status(201).json(await svc.createLocation(res.locals.body, ctx(req, res)));
  });
  r.patch("/locations/:id", write, validate("params", idParams), validate("body", locationUpdateSchema), async (req, res) => {
    res.json(await svc.updateLocation(paramId(res), res.locals.body, ctx(req, res)));
  });

  // Vehículos
  r.get("/vehicles", read, validate("query", catalogListQuerySchema), async (_req, res) => {
    res.json(await svc.listVehicles(res.locals.query as CatalogListQuery));
  });
  r.post("/vehicles", write, validate("body", vehicleCreateSchema), async (req, res) => {
    res.status(201).json(await svc.createVehicle(res.locals.body, ctx(req, res)));
  });
  r.patch("/vehicles/:id", write, validate("params", idParams), validate("body", vehicleUpdateSchema), async (req, res) => {
    res.json(await svc.updateVehicle(paramId(res), res.locals.body, ctx(req, res)));
  });

  return r;
}
