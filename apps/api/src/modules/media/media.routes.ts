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
  fields: 0, // solo archivos
  parts: 5,
} as const;

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
      res.status(201).json(await svc.upload(files, { actorId: currentUser(res).userId, ip: req.ip }));
    },
  );

  r.post("/urls", authorize("tools:read"), validate("body", urlsBody), async (_req, res) => {
    const { ids, variant } = res.locals.body as z.infer<typeof urlsBody>;
    res.json(await svc.signedUrls(ids, variant, currentUser(res).userId));
  });

  r.delete("/:id", validate("params", idParams), async (req, res) => {
    await svc.discard((res.locals.params as z.infer<typeof idParams>).id, { actorId: currentUser(res).userId, ip: req.ip });
    res.status(204).end();
  });

  return r;
}
