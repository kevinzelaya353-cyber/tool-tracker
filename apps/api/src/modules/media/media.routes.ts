import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { z } from "zod";
import { id } from "@tt/shared";
import { AppError } from "../../lib/errors.js";
import { authorize, authorizeAny, currentUser } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import type { MediaService } from "./media.service.js";

export const UPLOAD_LIMITS = {
  fileSize: 15 * 1024 * 1024, // 15 MB por foto (fotos de teléfono típicas: 3–8 MB)
  files: 5, // por petición; la app sube en tandas
  fields: 3, // ubicación opcional de la tanda: lat, lng, acc
  parts: 8,
} as const;

/** Ubicación opcional de la tanda (campos de texto del multipart). Ambas coordenadas o ninguna. */
const geoFields = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    acc: z.coerce.number().min(0).max(100_000).optional(),
  })
  .refine((g) => (g.lat == null) === (g.lng == null), { message: "Indica latitud y longitud juntas", path: ["lng"] });

// memoryStorage: el archivo original nunca toca el disco; se re-codifica y se descarta.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: UPLOAD_LIMITS,
  fileFilter: (_req, file, cb) => {
    // Filtro rápido por Content-Type; la validación real es por magic bytes en processImage.
    if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
      return cb(AppError.badRequest("UNSUPPORTED_IMAGE", "Formato no permitido: solo JPEG, PNG o WEBP"));
    }
    cb(null, true);
  },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (_req, res) => res.locals.auth?.userId ?? "anon", // por usuario, no por IP (varios en la misma obra/red)
});

const urlsBody = z.object({
  ids: z.array(id).min(1).max(50),
  variant: z.enum(["full", "thumb"]).default("thumb"),
});
const idParams = z.object({ id });

/** Montar detrás de `authenticate`. */
export function mediaRouter(svc: MediaService) {
  const r = Router();

  r.post(
    "/",
    authorizeAny("transfers:create", "lifecycle:create", "tools:write"),
    uploadLimiter,
    upload.array("photos", UPLOAD_LIMITS.files),
    async (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const g = geoFields.safeParse(req.body ?? {});
      if (!g.success) throw AppError.badRequest("VALIDATION_ERROR", "Ubicación de la foto inválida");
      const geo =
        g.data.lat != null && g.data.lng != null
          ? { latitude: g.data.lat, longitude: g.data.lng, accuracyM: g.data.acc == null ? undefined : Math.round(g.data.acc) }
          : undefined;
      res.status(201).json(await svc.upload(files, { actorId: currentUser(res).userId, ip: req.ip }, geo));
    },
  );

  r.post("/urls", authorize("tools:read"), validate("body", urlsBody), async (_req, res) => {
    const { ids, variant } = res.locals.body as z.infer<typeof urlsBody>;
    res.json(await svc.signedUrls(ids, variant, currentUser(res).userId));
  });

  r.delete("/:id", validate("params", idParams), async (req, res) => {
    const actor = currentUser(res);
    await svc.discard((res.locals.params as z.infer<typeof idParams>).id, { actorId: actor.userId, role: actor.role, ip: req.ip });
    res.status(204).end();
  });

  return r;
}
