import type { Prisma, PrismaClient } from "@prisma/client";
import type { AuditQuery } from "@tt/shared";

/**
 * Consulta de la auditoría. `organizationId`:
 * - string: solo esa organización (administrador de la organización, o SuperAdmin dentro de ella);
 * - null: todas (auditoría global del SuperAdmin), con el filtro opcional `q.organizationId`.
 * Usa el cliente sin filtro automático: audit_log no es un modelo de organización y el alcance
 * se decide aquí de forma explícita.
 */
export async function queryAudit(prisma: PrismaClient, q: AuditQuery, organizationId: string | null) {
  const where: Prisma.AuditLogWhereInput = {
    organizationId: organizationId ?? q.organizationId,
    action: q.action ?? (q.module ? { startsWith: `${q.module}.` } : undefined),
    result: q.result,
    entity: q.entity,
    entityId: q.entityId,
    ...(q.userId && { OR: [{ actorId: q.userId }, { effectiveUserId: q.userId }] }),
    ...((q.from || q.to) && { at: { gte: q.from, lte: q.to } }),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        actor: { select: { id: true, name: true, role: true } },
        effectiveUser: { select: { id: true, name: true, role: true } },
        organization: { select: { id: true, name: true } },
      },
    }),
  ]);
  // BigInt no es serializable a JSON.
  return { total, page: q.page, pageSize: q.pageSize, data: rows.map((r) => ({ ...r, id: r.id.toString() })) };
}
