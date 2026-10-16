import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/errors.js";

const PRISMA_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  P2002: { status: 409, code: "DUPLICATE", message: "Ya existe un registro con ese valor único" },
  P2003: { status: 409, code: "INVALID_REFERENCE", message: "Referencia a un registro inexistente" },
  P2025: { status: 404, code: "NOT_FOUND", message: "Registro no encontrado" },
  P2034: { status: 409, code: "CONCURRENT_UPDATE", message: "Conflicto de concurrencia, reintenta" },
};

export const notFound: RequestHandler = (_req, _res, next) => next(AppError.notFound("Recurso"));

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  // body-parser: JSON mal formado o demasiado grande
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "INVALID_JSON", message: "JSON inválido" } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Payload demasiado grande" } });
    return;
  }

  // Límites de subida (multer).
  if (err?.name === "MulterError") {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? "FILE_TOO_LARGE" : "INVALID_UPLOAD",
        message: tooLarge ? "La foto supera el tamaño máximo (15 MB)" : "Subida inválida: usa el campo 'photos' (máx. 5 archivos)",
      },
    });
    return;
  }

  // Errores conocidos de Prisma (por nombre/código para no acoplar este módulo al cliente generado).
  if (err?.name === "PrismaClientKnownRequestError") {
    const mapped = PRISMA_ERRORS[err.code as string];
    if (mapped) {
      res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
      return;
    }
  }

  // Nunca exponer stack ni mensajes internos (p. ej. de Prisma) al cliente.
  req.log?.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Error interno" } });
};
