import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  actorId: string | null;
  action: string; // p. ej. "auth.login", "user.update", "transfer.create"
  entity: string;
  entityId?: string | null;
  diff?: Record<string, unknown>;
  ip?: string | null;
}

const SENSITIVE = /pass(word)?|hash|token|secret/i;

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
 */
export async function audit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      diff: entry.diff ? (redact(entry.diff) as Prisma.InputJsonValue) : undefined,
      ip: entry.ip?.slice(0, 45) ?? null,
    },
  });
}
