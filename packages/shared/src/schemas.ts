import { z } from "zod";
import { ITEM_OUTCOME, LOCATION_TYPE, MANUAL_EVENT_TYPE, PHOTO_STAGE, ROLE, TOOL_STATUS, TRANSFER_STATUS, type Role } from "./enums.js";

// ---------- Primitivos ----------

export const id = z.string().uuid();

/** Dinero como string decimal para no perder precisión con floats (se guarda en NUMERIC(12,2)). */
export const money = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Monto inválido (máx. 2 decimales)");

const pastOrNow = z.coerce
  .date()
  .refine((d) => d.getTime() <= Date.now() + 60_000, "La fecha no puede ser futura");

// PostgreSQL no admite el byte NUL en columnas de texto: se rechaza en la entrada (si no, sería un 500).
const noNul = (s: string) => !s.includes("\u0000");
const shortText = (max: number) => z.string().trim().min(1).max(max).refine(noNul, "Caracteres no válidos");
const optionalText = (max: number) => z.string().trim().max(max).refine(noNul, "Caracteres no válidos").optional();

// ---------- Auth ----------

/** `username` acepta el usuario corto o, en cuentas antiguas, el correo. */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, "Escribe tu usuario").max(254),
  password: z.string().min(1, "Escribe tu PIN o contraseña").max(128),
});

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mínimo 3 caracteres")
  .max(30, "Máximo 30 caracteres")
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "Solo letras sin tildes, números, punto, guion y guion bajo");

/** Contraseña completa: obligatoria para administradores. */
export const passwordSchema = z
  .string()
  .min(10, "Mínimo 10 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "Debe incluir letras")
  .regex(/\d/, "Debe incluir números");

// Los más usados según estudios de PINs filtrados, además de repeticiones y escaleras (se validan aparte).
const COMMON_PINS = new Set(["1212", "1004", "2000", "6969", "1122", "1313", "2580", "0852", "5683", "1010", "2001", "7777"]);
const isRunOrRepeat = (pin: string) => {
  const d = [...pin].map(Number);
  const steps = new Set(d.slice(1).map((n, i) => n - d[i]!));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]!);
};

/** PIN de 4 dígitos: credencial de los usuarios que no son administradores. */
export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, "El PIN debe tener exactamente 4 dígitos")
  .refine((p) => !COMMON_PINS.has(p) && !isRunOrRepeat(p), "PIN demasiado fácil de adivinar, elige otro");

/** Los administradores usan contraseña completa; el resto, PIN. */
export const credentialSchemaFor = (role: Role) => (role === "ADMIN" ? passwordSchema : pinSchema);

export const userCreateSchema = z
  .object({
    name: shortText(120),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    password: z.string().max(128),
    role: z.enum(ROLE),
    /** Vehículo que se preselecciona cuando esta persona lleva un traslado (choferes). */
    defaultVehicleId: id.nullable().optional(),
  })
  .superRefine((u, ctx) => {
    const r = credentialSchemaFor(u.role).safeParse(u.password);
    if (!r.success) for (const issue of r.error.issues) ctx.addIssue({ ...issue, path: ["password"] });
  });

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

/**
 * La credencial se valida contra el rol final en el servicio (puede cambiar en la misma petición).
 * Con `username` + `password` se le da acceso a una persona que no lo tenía.
 */
export const userUpdateSchema = z
  .object({
    name: shortText(120),
    username: usernameSchema,
    role: z.enum(ROLE),
    active: z.boolean(),
    password: z.string().min(1).max(128),
    /** Quita el bloqueo por intentos fallidos sin cambiar el PIN. */
    unlock: z.literal(true),
    defaultVehicleId: id.nullable(),
  })
  .partial()
  .refine((u) => Object.keys(u).length > 0, "Nada que actualizar");

/** Persona sin acceso a la app: solo aparece como quien entrega o recibe herramientas. */
export const personCreateSchema = z.object({
  name: shortText(120),
});

// ---------- Catálogos ----------

export const categoryCreateSchema = z.object({ name: shortText(80) });

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const bothOrNeither = (v: { latitude?: number | null; longitude?: number | null }) =>
  (v.latitude == null) === (v.longitude == null);
const COORDS_MSG = { message: "Indica latitud y longitud juntas", path: ["longitude"] };

export const locationCreateSchema = z
  .object({
    name: shortText(120),
    type: z.enum(LOCATION_TYPE),
    address: optionalText(250),
    latitude: latitude.optional(),
    longitude: longitude.optional(),
  })
  .refine(bothOrNeither, COORDS_MSG);

export const vehicleCreateSchema = z.object({
  plate: z.string().trim().toUpperCase().min(3).max(15),
  description: optionalText(120),
});

const atLeastOne = <T extends z.ZodRawShape>(s: z.ZodObject<T>) =>
  s.partial().refine((v) => Object.values(v).some((x) => x !== undefined), "Nada que actualizar");

export const categoryUpdateSchema = atLeastOne(categoryCreateSchema);

export const locationUpdateSchema = atLeastOne(
  z.object({
    name: shortText(120),
    address: optionalText(250),
    active: z.boolean(),
    startedAt: z.coerce.date().nullable(),
    closedAt: z.coerce.date().nullable(),
    // null quita el punto del mapa.
    latitude: latitude.nullable(),
    longitude: longitude.nullable(),
  }),
).refine(bothOrNeither, COORDS_MSG);

export const vehicleUpdateSchema = atLeastOne(vehicleCreateSchema.extend({ active: z.boolean() }));

export const catalogListQuerySchema = z.object({
  type: z.enum(LOCATION_TYPE).optional(),
  includeInactive: z.enum(["true", "false"]).optional(),
});

// ---------- Herramientas ----------

export const toolCreateSchema = z.object({
  id: id.optional(), // permite UUID generado en el cliente (soporte offline futuro)
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,30}$/, "Código inválido"),
  categoryId: id,
  brand: shortText(60),
  model: optionalText(60),
  serial: optionalText(80),
  purchasePrice: money,
  purchaseDate: pastOrNow,
  supplier: optionalText(120),
  initialLocationId: id, // debe ser una BODEGA
  photoId: id.optional(), // foto propia, ya subida por /media
});

export const toolUpdateSchema = toolCreateSchema
  .omit({ id: true, initialLocationId: true, photoId: true })
  .partial();

/** Cambia la foto propia de la herramienta (null la quita). */
export const toolPhotoSchema = z.object({ photoId: id.nullable() });

export const toolListQuerySchema = z.object({
  status: z.enum(TOOL_STATUS).optional(),
  categoryId: id.optional(),
  locationId: id.optional(),
  q: z.string().trim().max(80).refine(noNul, "Caracteres no válidos").optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Traslados ----------

export const transferCreateSchema = z
  .object({
    id: id.optional(),
    fromLocationId: id,
    toLocationId: id,
    deliveredById: id,
    receivedById: id,
    /** Con chofer: las herramientas quedan en tránsito hasta que se confirma la recepción. */
    driverId: id.optional(),
    vehicleId: id.optional(),
    movedAt: pastOrNow,
    notes: optionalText(500),
    items: z
      .array(z.object({ toolId: id, conditionNote: optionalText(250) }))
      .min(1, "Agrega al menos una herramienta")
      .max(100),
    photoIds: z.array(id).max(20).default([]), // fotos al entregar
    receptionPhotoIds: z.array(id).max(20).default([]), // fotos al recibir
  })
  .refine((t) => t.fromLocationId !== t.toLocationId, {
    message: "Origen y destino deben ser distintos",
    path: ["toLocationId"],
  })
  .refine((t) => t.deliveredById !== t.receivedById, {
    message: "Quien entrega y quien recibe deben ser personas distintas",
    path: ["receivedById"],
  })
  .refine((t) => new Set(t.items.map((i) => i.toolId)).size === t.items.length, {
    message: "Herramienta duplicada en el traslado",
    path: ["items"],
  })
  .refine((t) => !t.driverId || t.receptionPhotoIds.length === 0, {
    message: "Con chofer, las fotos de recepción se toman al confirmar la llegada",
    path: ["receptionPhotoIds"],
  });

/**
 * Confirmación de llegada de un traslado con chofer. Cada herramienta del traslado debe venir
 * con su resultado. `pin` es el de quien recibe cuando confirma desde otro teléfono (el del chofer).
 */
export const transferReceiveSchema = z
  .object({
    receivedAt: pastOrNow,
    items: z
      .array(z.object({ toolId: id, outcome: z.enum(ITEM_OUTCOME), note: optionalText(250) }))
      .min(1)
      .max(100),
    photoIds: z.array(id).max(20).default([]),
    pin: z.string().regex(/^\d{4}$/, "El PIN debe tener 4 dígitos").optional(),
    notes: optionalText(500),
  })
  .refine((r) => new Set(r.items.map((i) => i.toolId)).size === r.items.length, {
    message: "Herramienta duplicada",
    path: ["items"],
  })
  .refine((r) => r.items.every((i) => i.outcome === "RECIBIDA" || i.note), {
    message: "Describe qué pasó con cada herramienta dañada o que no llegó",
    path: ["items"],
  });

/** Fotos agregadas después de registrar el traslado (p. ej. al llegar al destino). */
export const transferPhotosSchema = z.object({
  photoIds: z.array(id).min(1).max(20),
  stage: z.enum(PHOTO_STAGE),
});

export const transferListQuerySchema = z.object({
  locationId: id.optional(), // origen o destino
  toolId: id.optional(),
  status: z.enum(TRANSFER_STATUS).optional(),
  driverId: id.optional(), // "mi carga" del chofer
  receivedById: id.optional(), // "por recibir" de quien está en el destino
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------- Eventos de ciclo de vida ----------

export const lifecycleEventCreateSchema = z.object({
  toolId: id,
  type: z.enum(MANUAL_EVENT_TYPE),
  occurredAt: pastOrNow,
  cost: money.optional(), // costo de mantenimiento/reparación
  description: optionalText(500),
  locationId: id.optional(), // obligatorio para MAINTENANCE_END y RECOVERY (bodega)
  photoIds: z.array(id).max(20).default([]),
});

// ---------- Reportes ----------

const MAX_RANGE_MS = 10 * 366 * 86_400_000; // 10 años: acota la serie generada

export const reportRangeQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    granularity: z.enum(["month", "year"]).default("month"),
  })
  .refine((r) => r.from <= r.to, { message: "Rango inválido", path: ["to"] })
  .refine((r) => r.to.getTime() - r.from.getTime() <= MAX_RANGE_MS, {
    message: "El rango máximo es de 10 años",
    path: ["from"],
  });

/** Filtro opcional por periodo (sin fechas = histórico completo). */
export const reportFilterQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: "Rango inválido", path: ["to"] });

// ---------- Tipos inferidos ----------

export type LoginInput = z.infer<typeof loginSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type ToolPhotoInput = z.infer<typeof toolPhotoSchema>;
export type TransferPhotosInput = z.infer<typeof transferPhotosSchema>;
export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type ToolCreateInput = z.infer<typeof toolCreateSchema>;
export type ToolUpdateInput = z.infer<typeof toolUpdateSchema>;
export type ToolListQuery = z.infer<typeof toolListQuerySchema>;
export type TransferCreateInput = z.infer<typeof transferCreateSchema>;
export type TransferReceiveInput = z.infer<typeof transferReceiveSchema>;
export type TransferListQuery = z.infer<typeof transferListQuerySchema>;
export type LocationCreateInput = z.infer<typeof locationCreateSchema>;
export type LocationUpdateInput = z.infer<typeof locationUpdateSchema>;
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;
export type LifecycleEventCreateInput = z.infer<typeof lifecycleEventCreateSchema>;
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
export type ReportFilterQuery = z.infer<typeof reportFilterQuerySchema>;
