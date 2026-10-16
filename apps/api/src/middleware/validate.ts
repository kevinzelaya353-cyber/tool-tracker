import type { RequestHandler } from "express";
import type { ZodTypeAny, z } from "zod";
import { AppError } from "../lib/errors.js";

type Part = "body" | "query" | "params";

/**
 * Valida y normaliza una parte del request con un esquema Zod.
 * El resultado queda en res.locals[part] (req.query es de solo lectura en Express 5).
 */
export function validate<S extends ZodTypeAny>(part: Part, schema: S): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      return next(
        AppError.badRequest(
          "VALIDATION_ERROR",
          "Datos inválidos",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
    }
    res.locals[part] = result.data as z.infer<S>;
    next();
  };
}
