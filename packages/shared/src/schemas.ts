import { z } from "zod";
import {
  DAMAGE_KIND,
  DAMAGE_MAX_PHOTOS,
  ITEM_OUTCOME,
  LOCATION_TYPE,
  MANUAL_EVENT_TYPE,
  PASSWORD_ROLES,
  RENTAL_MAX_PHOTOS,
  RENTAL_STATUS,
  ROLE,
  TOOL_CONDITION,
  TOOL_OWNERSHIP,
  TENANT_ROLE,
  TOOL_STATUS,
  TRANSFER_STATUS,
  type Role,
} from "./enums.js";

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

/** Los administradores (y el SuperAdmin) usan contraseña completa; el resto, PIN. */
export const credentialSchemaFor = (role: Role) => (PASSWORD_ROLES.includes(role) ? passwordSchema : pinSchema);

export const userCreateSchema = z
  .object({
    name: shortText(120),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    password: z.string().max(128),
    /** Dentro de una organización nunca se crea un SuperAdmin. */
    role: z.enum(TENANT_ROLE),
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
    role: z.enum(TENANT_ROLE),
    active: z.boolean(),
    password: z.string().min(1).max(128),
    /** Quita el bloqueo por intentos fallidos sin cambiar el PIN. */
    unlock: z.literal(true),
    /** Bloquea la cuenta (no puede iniciar sesión hasta que la desbloqueen). */
    lock: z.literal(true),
    /** Obliga a cambiar el PIN o la contraseña en el próximo inicio de sesión. */
    mustChangePassword: z.boolean(),
    defaultVehicleId: id.nullable(),
  })
  .partial()
  .refine((u) => Object.keys(u).length > 0, "Nada que actualizar");

/** Cambio de la propia credencial (obligatorio si un administrador lo exigió). */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Escribe tu PIN o contraseña actual").max(128),
  newPassword: z.string().min(1).max(128),
});

/** Restablecer la credencial de otro usuario. Nunca se consulta la anterior. */
export const passwordResetSchema = z.object({
  password: z.string().min(1).max(128),
  /** Por defecto debe cambiarla al entrar: así quien la restableció no la conoce para siempre. */
  mustChangePassword: z.boolean().default(true),
});

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
    // Cambiar entre proyecto y bodega: solo si no tiene herramientas ni traslados en camino.
    type: z.enum(LOCATION_TYPE),
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
  ownership: z.enum(TOOL_OWNERSHIP).optional(),
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
  stage: z.enum(["ENTREGA", "RECEPCION"]), // DEVOLUCION es solo de alquileres
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

// ---------- Reportes de daño ----------

const photoIdList = (max: number) =>
  z
    .array(id)
    .max(max, `Máximo ${max} fotos`)
    .refine((ids) => new Set(ids).size === ids.length, "Foto repetida")
    .default([]);

/**
 * Cada reporte es un registro nuevo (nunca reemplaza a los anteriores). `id` lo genera la app: si la
 * petición se reintenta por un corte de red, la API devuelve el mismo reporte en vez de duplicarlo.
 * Si la herramienta tiene un alquiler activo, el reporte queda como incidencia de ese alquiler.
 */
export const damageReportCreateSchema = z.object({
  id,
  toolId: id,
  occurredAt: pastOrNow,
  kind: z.enum(DAMAGE_KIND),
  condition: z.enum(TOOL_CONDITION),
  description: shortText(500),
  notes: optionalText(500),
  photoIds: photoIdList(DAMAGE_MAX_PHOTOS),
});

// ---------- Alquileres ----------

const futureOk = z.coerce.date();

/** Datos de una herramienta rentada que aún no existe en el sistema (se da de alta al recibirla). */
export const rentalNewToolSchema = toolCreateSchema
  .pick({ code: true, categoryId: true, brand: true, model: true, serial: true })
  .extend({ photoId: id.optional() });

/**
 * Recepción de una herramienta rentada: abre un período de alquiler. Con `tool` se da de alta;
 * con `toolId`, una herramienta rentada ya conocida (devuelta en un período anterior) vuelve a llegar.
 */
export const rentalCreateSchema = z
  .object({
    id,
    toolId: id.optional(),
    tool: rentalNewToolSchema.optional(),
    lessor: shortText(120),
    receivedAt: pastOrNow,
    expectedReturnAt: futureOk.optional(),
    locationId: id,
    notes: optionalText(500),
    receptionCondition: z.enum(TOOL_CONDITION),
    receptionDescription: optionalText(500),
    receptionNotes: optionalText(500),
    photoIds: photoIdList(RENTAL_MAX_PHOTOS),
  })
  .refine((r) => !!r.toolId !== !!r.tool, { message: "Indica una herramienta existente o los datos de una nueva", path: ["toolId"] })
  .refine((r) => !r.expectedReturnAt || r.expectedReturnAt.getTime() >= r.receivedAt.getTime() - 86_400_000, {
    message: "La devolución prevista no puede ser anterior a la recepción",
    path: ["expectedReturnAt"],
  });

/** Devolución al arrendador: cierra el período. La evidencia de recepción no se toca. */
export const rentalReturnSchema = z.object({
  returnedAt: pastOrNow,
  returnCondition: z.enum(TOOL_CONDITION),
  returnDescription: optionalText(500),
  returnNotes: optionalText(500),
  /** Qué cambió respecto a cómo se recibió (golpes nuevos, piezas faltantes…). */
  differences: optionalText(500),
  photoIds: photoIdList(RENTAL_MAX_PHOTOS),
});

export const rentalListQuerySchema = z.object({
  toolId: id.optional(),
  status: z.enum(RENTAL_STATUS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
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

/**
 * Filtro opcional por periodo (sin fechas = histórico completo), categoría y ubicación actual.
 * Los mismos filtros se aplican a los totales y a su detalle, para que siempre coincidan.
 */
export const reportFilterQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    categoryId: id.optional(),
    locationId: id.optional(),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: "Rango inválido", path: ["to"] });

/**
 * Qué conjunto de registros forma una cifra del tablero:
 * - tools: herramientas que cumplen los filtros (por estado, ubicación…), estado actual.
 * - inventory: herramientas que siguen en uso o recuperables (no dañadas, extraviadas ni de baja).
 * - purchases: herramientas propias compradas en el periodo (valor de adquisición).
 * - maintenance: gastos de mantenimiento y reparación registrados en el periodo.
 * - losses: herramientas dañadas, extraviadas o de baja, por la fecha en que dejaron de estar sanas.
 */
export const REPORT_METRIC = ["tools", "inventory", "purchases", "maintenance", "losses"] as const;
export type ReportMetric = (typeof REPORT_METRIC)[number];

export const reportDetailQuerySchema = z
  .object({
    metric: z.enum(REPORT_METRIC),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    /** Una barra de la serie: inicio del periodo (YYYY-MM-01) con su granularidad, igual que la gráfica. */
    period: z.string().regex(/^\d{4}-\d{2}-01$/, "Periodo inválido").optional(),
    granularity: z.enum(["month", "year"]).default("month"),
    status: z.enum(TOOL_STATUS).optional(),
    categoryId: id.optional(),
    locationId: id.optional(),
    q: z.string().trim().max(80).refine(noNul, "Caracteres no válidos").optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((r) => !r.from || !r.to || r.from <= r.to, { message: "Rango inválido", path: ["to"] });

// ---------- Plataforma (SuperAdmin) ----------

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Solo minúsculas, números y guiones");

export const organizationCreateSchema = z.object({
  name: shortText(120),
  slug: slugSchema.optional(),
  legalName: optionalText(160),
  taxId: optionalText(40),
  contactEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  contactPhone: optionalText(40),
  address: optionalText(250),
  /** Moneda ISO 4217 con la que se muestran los montos de la organización. */
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Código de moneda ISO de 3 letras").default("HNL"),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hexadecimal, p. ej. #F59E0B").optional(),
  /** Primer administrador de la organización (opcional: se puede crear después). */
  admin: z
    .object({
      name: shortText(120),
      username: usernameSchema,
      email: z.string().trim().toLowerCase().email().max(254).optional(),
      password: passwordSchema,
    })
    .optional(),
});

export const organizationUpdateSchema = z
  .object({
    name: shortText(120),
    slug: slugSchema,
    legalName: z.string().trim().max(160).refine(noNul, "Caracteres no válidos").nullable(),
    taxId: z.string().trim().max(40).refine(noNul, "Caracteres no válidos").nullable(),
    contactEmail: z.string().trim().toLowerCase().email().max(254).nullable(),
    contactPhone: z.string().trim().max(40).refine(noNul, "Caracteres no válidos").nullable(),
    address: z.string().trim().max(250).refine(noNul, "Caracteres no válidos").nullable(),
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Código de moneda ISO de 3 letras"),
    brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color hexadecimal, p. ej. #F59E0B").nullable(),
    active: z.boolean(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, "Nada que actualizar");

/** Alta de un usuario desde la plataforma: en una organización o, sin ella, otro SuperAdmin. */
export const platformUserCreateSchema = z
  .object({
    organizationId: id.optional(),
    name: shortText(120),
    username: usernameSchema,
    email: z.string().trim().toLowerCase().email().max(254).optional(),
    password: z.string().max(128),
    role: z.enum(ROLE),
    /** Contraseña de quien opera: obligatoria para crear otro SuperAdmin. */
    confirmPassword: z.string().max(128).optional(),
  })
  .superRefine((u, ctx) => {
    if ((u.role === "SUPERADMIN") === Boolean(u.organizationId)) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationId"],
        message: u.role === "SUPERADMIN" ? "Un SuperAdmin no pertenece a ninguna organización" : "Elige la organización",
      });
    }
    const r = credentialSchemaFor(u.role).safeParse(u.password);
    if (!r.success) for (const issue of r.error.issues) ctx.addIssue({ ...issue, path: ["password"] });
  });

/** Cambios sobre una cuenta SuperAdmin (operación crítica: exige la contraseña de quien opera). */
export const platformSuperadminUpdateSchema = z.object({
  name: shortText(120).optional(),
  active: z.boolean().optional(),
  confirmPassword: z.string().min(1, "Confirma con tu contraseña").max(128),
});

/** Restablecer la contraseña de otro SuperAdmin también exige la de quien opera. */
export const platformPasswordResetSchema = passwordResetSchema.extend({
  confirmPassword: z.string().max(128).optional(),
});

export const platformUserListQuerySchema = z.object({
  organizationId: id.optional(),
  role: z.enum(ROLE).optional(),
  q: z.string().trim().max(80).refine(noNul, "Caracteres no válidos").optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const impersonationStartSchema = z.object({
  userId: id,
  /** Motivo del soporte: queda en la auditoría. */
  reason: z.string().trim().min(5, "Indica el motivo (mín. 5 caracteres)").max(300).refine(noNul, "Caracteres no válidos"),
});

export const AUDIT_RESULT = ["SUCCESS", "FAILURE", "DENIED"] as const;
export type AuditResult = (typeof AUDIT_RESULT)[number];

export const auditQuerySchema = z.object({
  /** Solo en la auditoría global (SuperAdmin). */
  organizationId: id.optional(),
  /** Usuario real o efectivo (en una sesión de soporte, cualquiera de los dos). */
  userId: id.optional(),
  action: z.string().max(60).optional(),
  /** Prefijo de la acción: tool, transfer, user, auth, impersonation… */
  module: z.string().regex(/^[a-z_]{2,30}$/).optional(),
  result: z.enum(AUDIT_RESULT).optional(),
  entity: z.string().max(60).optional(),
  entityId: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

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
export type DamageReportCreateInput = z.infer<typeof damageReportCreateSchema>;
export type RentalCreateInput = z.infer<typeof rentalCreateSchema>;
export type RentalReturnInput = z.infer<typeof rentalReturnSchema>;
export type RentalListQuery = z.infer<typeof rentalListQuerySchema>;
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;
export type ReportFilterQuery = z.infer<typeof reportFilterQuerySchema>;
export type ReportDetailQuery = z.infer<typeof reportDetailQuerySchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type PlatformPasswordResetInput = z.infer<typeof platformPasswordResetSchema>;
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;
export type PlatformUserCreateInput = z.infer<typeof platformUserCreateSchema>;
export type PlatformSuperadminUpdateInput = z.infer<typeof platformSuperadminUpdateSchema>;
export type PlatformUserListQuery = z.infer<typeof platformUserListQuerySchema>;
export type ImpersonationStartInput = z.infer<typeof impersonationStartSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
