import { Router } from "express";
import { z } from "zod";
import {
  can,
  id,
  toolCreateSchema,
  toolListQuerySchema,
  toolPhotoSchema,
  toolUpdateSchema,
  type ToolListQuery,
  type ToolPhotoInput,
  type ToolUpdateInput,
} from "@tt/shared";
import { AppError } from "../../lib/errors.js";
import { authorize, canSeeValues, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { DamageService } from "../damage/damage.service.js";
import type { ToolsService } from "./tools.service.js";

const idParams = z.object({ id });

/**
 * Sin permiso de ver valores (finance:read) la API no envía el precio de compra ni los costos:
 * ocultarlos solo en la app no bastaría.
 */
function withoutPrice<T extends { purchasePrice?: unknown }>(tool: T): Omit<T, "purchasePrice"> {
  const { purchasePrice: _hidden, ...rest } = tool;
  return rest;
}
const withoutCost = <T extends { cost?: unknown }>(e: T): Omit<T, "cost"> => {
  const { cost: _hidden, ...rest } = e;
  return rest;
};
const codeParams = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9-]{3,30}$/) });

/** Montar detrás de `authenticate`. */
export function toolsRouter(svc: ToolsService, damage: DamageService) {
  const r = Router();
  const read = authorize("tools:read");
  const write = authorize("tools:write");
  const toolId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  r.get("/", read, validate("query", toolListQuerySchema), async (_req, res) => {
    const page = await svc.list(res.locals.query as ToolListQuery);
    res.json(canSeeValues(res) ? page : { ...page, data: page.data.map(withoutPrice) });
  });

  // Conteo por categoría para la vista agrupada de la app (mismos filtros que la lista).
  r.get("/categories", read, validate("query", toolListQuerySchema.omit({ categoryId: true, page: true, pageSize: true })), async (_req, res) => {
    res.json(await svc.countByCategory(res.locals.query as ToolListQuery));
  });

  // Escaneo de QR desde la app.
  r.get("/by-code/:code", read, validate("params", codeParams), async (_req, res) => {
    const tool = await svc.getByCode((res.locals.params as z.infer<typeof codeParams>).code);
    res.json(canSeeValues(res) ? tool : withoutPrice(tool));
  });

  r.get("/:id", read, validate("params", idParams), async (_req, res) => {
    const tool = await svc.get(toolId(res));
    res.json(canSeeValues(res) ? tool : withoutPrice(tool));
  });

  r.get("/:id/history", read, validate("params", idParams), async (_req, res) => {
    const events = await svc.history(toolId(res));
    res.json(canSeeValues(res) ? events : events.map(withoutCost));
  });

  // Historial de daños: cada reporte con sus propias fotos y observaciones, del más reciente al más antiguo.
  r.get("/:id/damage-reports", read, validate("params", idParams), async (_req, res) => {
    res.json(await damage.listForTool(toolId(res)));
  });

  r.post("/", write, validate("body", toolCreateSchema), async (req, res) => {
    const tool = await svc.create(res.locals.body, { actorId: currentUser(res).userId, ip: req.ip });
    res.status(201).json(canSeeValues(res) ? tool : withoutPrice(tool));
  });

  r.patch("/:id", write, validate("params", idParams), validate("body", toolUpdateSchema), async (req, res) => {
    const body = res.locals.body as ToolUpdateInput;
    const actor = currentUser(res);
    // Precio y fecha de compra alimentan los reportes financieros: solo un administrador los corrige.
    if ((body.purchasePrice !== undefined || body.purchaseDate !== undefined) && !can(actor.role, "tools:financial")) {
      throw AppError.forbidden("Solo un administrador puede corregir el precio o la fecha de compra");
    }
    const tool = await svc.update(toolId(res), body, { actorId: actor.userId, ip: req.ip });
    res.json(canSeeValues(res) ? tool : withoutPrice(tool));
  });

  r.put("/:id/photo", write, validate("params", idParams), validate("body", toolPhotoSchema), async (req, res) => {
    const { photoId } = res.locals.body as ToolPhotoInput;
    const tool = await svc.setPhoto(toolId(res), photoId, { actorId: currentUser(res).userId, ip: req.ip });
    res.json(canSeeValues(res) ? tool : withoutPrice(tool));
  });

  return r;
}
