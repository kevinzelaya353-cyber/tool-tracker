import { Router } from "express";
import { z } from "zod";
import {
  can,
  id,
  toolCreateSchema,
  toolListQuerySchema,
  toolUpdateSchema,
  type ToolListQuery,
  type ToolUpdateInput,
} from "@tt/shared";
import { AppError } from "../../lib/errors.js";
import { authorize, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { ToolsService } from "./tools.service.js";

const idParams = z.object({ id });
const codeParams = z.object({ code: z.string().trim().regex(/^[A-Za-z0-9-]{3,30}$/) });

/** Montar detrás de `authenticate`. */
export function toolsRouter(svc: ToolsService) {
  const r = Router();
  const read = authorize("tools:read");
  const write = authorize("tools:write");
  const toolId = (res: { locals: Record<string, unknown> }) => (res.locals.params as z.infer<typeof idParams>).id;

  r.get("/", read, validate("query", toolListQuerySchema), async (_req, res) => {
    res.json(await svc.list(res.locals.query as ToolListQuery));
  });

  // Escaneo de QR desde la app.
  r.get("/by-code/:code", read, validate("params", codeParams), async (_req, res) => {
    res.json(await svc.getByCode((res.locals.params as z.infer<typeof codeParams>).code));
  });

  r.get("/:id", read, validate("params", idParams), async (_req, res) => {
    res.json(await svc.get(toolId(res)));
  });

  r.get("/:id/history", read, validate("params", idParams), async (_req, res) => {
    res.json(await svc.history(toolId(res)));
  });

  r.post("/", write, validate("body", toolCreateSchema), async (req, res) => {
    res.status(201).json(await svc.create(res.locals.body, { actorId: currentUser(res).userId, ip: req.ip }));
  });

  r.patch("/:id", write, validate("params", idParams), validate("body", toolUpdateSchema), async (req, res) => {
    const body = res.locals.body as ToolUpdateInput;
    const actor = currentUser(res);
    // Precio y fecha de compra alimentan los reportes financieros: solo un administrador los corrige.
    if ((body.purchasePrice !== undefined || body.purchaseDate !== undefined) && !can(actor.role, "tools:financial")) {
      throw AppError.forbidden("Solo un administrador puede corregir el precio o la fecha de compra");
    }
    res.json(await svc.update(toolId(res), body, { actorId: actor.userId, ip: req.ip }));
  });

  return r;
}
