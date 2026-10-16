import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { authorize } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";

const auditQuery = z.object({
  entity: z.string().max(60).optional(),
  entityId: z.string().max(64).optional(),
  actorId: z.string().uuid().optional(),
  action: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** Montar detrás de `authenticate`. Solo lectura: el log no se edita por API. */
export function auditRouter(prisma: PrismaClient) {
  const r = Router();

  r.get("/", authorize("audit:read"), validate("query", auditQuery), async (_req, res) => {
    const q = res.locals.query as z.infer<typeof auditQuery>;
    const where = { entity: q.entity, entityId: q.entityId, actorId: q.actorId, action: q.action };
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { at: "desc" },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { actor: { select: { id: true, name: true } } },
      }),
    ]);
    // BigInt no es serializable a JSON.
    res.json({ total, page: q.page, pageSize: q.pageSize, data: rows.map((r) => ({ ...r, id: r.id.toString() })) });
  });

  return r;
}
