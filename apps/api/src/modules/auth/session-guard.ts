import type { PrismaClient } from "@prisma/client";
import type { SessionGuard } from "../../middleware/auth.js";

/** Cuánto se recuerda si una organización está activa (desactivarla tarda como máximo esto en aplicarse). */
const ORG_CACHE_MS = 30_000;

/**
 * Comprobaciones por petición contra la BD (cliente sin filtro: es infraestructura de autenticación).
 * El estado de la organización se cachea unos segundos; las sesiones de soporte se consultan siempre,
 * para que revocarlas tenga efecto inmediato.
 */
export function prismaSessionGuard(prisma: PrismaClient, now: () => number = Date.now) {
  const orgs = new Map<string, { active: boolean | null; at: number }>();

  const lookup = async (orgId: string) => {
    const hit = orgs.get(orgId);
    if (hit && now() - hit.at < ORG_CACHE_MS) return hit.active;
    const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { active: true } });
    const active = org ? org.active : null;
    orgs.set(orgId, { active, at: now() });
    return active;
  };

  const guard: SessionGuard & { invalidate(orgId: string): void } = {
    organizationActive: async (orgId) => (await lookup(orgId)) === true,
    organizationExists: async (orgId) => (await lookup(orgId)) !== null,
    impersonationActive: async (id) =>
      (await prisma.impersonationSession.count({ where: { id, endedAt: null, expiresAt: { gt: new Date(now()) } } })) === 1,
    invalidate: (orgId) => void orgs.delete(orgId),
  };
  return guard;
}

export type PrismaSessionGuard = ReturnType<typeof prismaSessionGuard>;
