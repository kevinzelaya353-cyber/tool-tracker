import type { ZodType } from "zod";

/**
 * Valida con el mismo esquema que usa la API y devuelve el primer mensaje por campo
 * ("tool.code", "lessor"…). Vacío = válido. La API vuelve a validar: esto solo evita viajes inútiles.
 */
export function fieldErrors(schema: ZodType, value: unknown): Record<string, string> {
  const r = schema.safeParse(value);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join(".");
    out[key] ??= issue.message;
  }
  return out;
}
