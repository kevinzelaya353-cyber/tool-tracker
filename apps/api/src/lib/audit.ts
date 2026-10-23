import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditResult } from "@tt/shared";
import { currentContext } from "./context.js";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  /** Usuario con cuyos permisos se hizo la acción (el efectivo). El real sale del contexto. */
  actorId: string | null;
  action: string; // p. ej. "auth.login", "user.update", "transfer.create"
  entity: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
  ip?: string | null;
  result?: AuditResult;
  /** Solo si difiere de la organización del contexto (p. ej. acciones de plataforma sobre una organización). */
  organizationId?: string | null;
}

const SENSITIVE = /pass(word)?|hash|token|secret|pin$/i;

const isPlainObject = (v: unknown): v is Record<string, unknown> => {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/**
 * Quita campos sensibles (a cualquier profundidad) antes de persistir.
 * Solo recorre objetos planos: instancias como Decimal o Date se serializan con su
 * propio toJSON (Decimal → "100.50"), en vez de desarmarse en sus campos internos.
 */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : redact(v)]),
    );
  }
  if (value && typeof value === "object" && "toJSON" in value && typeof value.toJSON === "function") {
    return value.toJSON();
  }
  return value;
}

/**
 * Registra una acción en audit_log. Pasa el cliente de la transacción (`tx`)
 * cuando la acción es parte de una operación transaccional, para que el
 * registro se confirme o revierta junto con ella.
 *
 * Del contexto de la petición toma la organización y, en una sesión de soporte, al usuario
 * REAL (el SuperAdmin): la acción nunca queda atribuida solo al usuario impersonado.
 */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  const ctx = currentContext();
  const effective = entry.actorId;
  const real = ctx?.impersonationId && ctx.actorId ? ctx.actorId : effective;
  await db.auditLog.create({
    data: {
      actorId: real,
      effectiveUserId: effective,
      organizationId: entry.organizationId !== undefined ? entry.organizationId : (ctx?.orgId ?? null),
      impersonationId: ctx?.impersonationId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      result: entry.result ?? "SUCCESS",
      diff: entry.diff ? (redact(entry.diff) as Prisma.InputJsonValue) : undefined,
      ip: (entry.ip ?? ctx?.ip)?.slice(0, 45) ?? null,
      userAgent: ctx?.userAgent?.slice(0, 200) ?? null,
    },
  });
}
