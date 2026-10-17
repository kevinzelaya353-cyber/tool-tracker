import { z } from "zod";
import { isValidTimeZone } from "../modules/reports/report-helpers.js";

const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.string().url().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3000),
  // Número de proxies de confianza delante de la API (0 = expuesta directamente).
  // Con un valor mayor al real, un cliente puede falsear X-Forwarded-For y evadir el rate limit.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET debe tener al menos 32 caracteres"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET debe tener al menos 32 caracteres"),
  ACCESS_TTL_MIN: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  // "local": fotos en disco servidas por la API (desarrollo sin Docker). "s3": MinIO/S3.
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  // URL de la API alcanzable desde el teléfono (para los enlaces de fotos en modo local).
  API_PUBLIC_URL: optionalUrl,
  S3_ENDPOINT: optionalUrl,
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_ENDPOINT: optionalUrl,
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  MEDIA_URL_TTL_SEC: z.coerce.number().int().min(60).max(3600).default(600),
  // Zona horaria para agrupar reportes por mes/año (IANA, p. ej. America/Mexico_City).
  REPORTS_TZ: z.string().default("UTC").refine(isValidTimeZone, "Zona horaria IANA inválida"),
  // Rutas de traslados: OpenRouteService si hay clave; si no, OSRM (el servidor público es solo de prueba).
  ORS_API_KEY: z.string().optional(),
  OSRM_URL: z.string().default("https://router.project-osrm.org"), // vacío = sin rutas
  MEDIA_ORPHAN_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
}).superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER !== "s3") return;
  for (const k of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"] as const) {
    if (!env[k]) ctx.addIssue({ code: "custom", path: [k], message: "Requerido con STORAGE_DRIVER=s3" });
  }
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Solo nombres de variables, nunca valores (evita filtrar secretos en logs).
    const fields = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Variables de entorno inválidas:\n  ${fields}`);
  }
  return parsed.data;
}
