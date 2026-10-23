import type { PrismaClient } from "@prisma/client";
import { TOOL_STATUS, type PlatformOrgStats, type PlatformOverview, type ToolStatus } from "@tt/shared";

/**
 * Tablero global del SuperAdmin: indicadores por organización, para comparar empresas.
 * Las cifras de cada empresa usan las mismas definiciones que su propio tablero (compras =
 * herramientas propias; dañadas = estado actual, valor de adquisición). Los montos solo se
 * consolidan si todas las organizaciones usan la misma moneda (la app lo indica).
 */
export class OverviewService {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(): Promise<PlatformOverview> {
    const [orgs, users, tools, statuses, activity, superadmins] = await Promise.all([
      this.prisma.organization.findMany({ select: { id: true, name: true, active: true, currency: true }, orderBy: { name: "asc" } }),
      this.prisma.$queryRaw<{ org: string; users: number; active: number }[]>`
        SELECT organization_id AS org, count(*)::int AS users,
               count(*) FILTER (WHERE active AND locked_at IS NULL)::int AS active
        FROM users
        WHERE organization_id IS NOT NULL AND (username IS NOT NULL OR email IS NOT NULL)
        GROUP BY organization_id`,
      this.prisma.$queryRaw<
        { org: string; tools: number; damagedCount: number; damagedValue: string; purchasesCount: number; purchasesValue: string; inventoryValue: string }[]
      >`
        SELECT organization_id AS org,
               count(*) FILTER (WHERE status NOT IN ('DADA_DE_BAJA', 'DEVUELTA'))::int                          AS tools,
               count(*) FILTER (WHERE status = 'DANADA')::int                                                   AS "damagedCount",
               coalesce(sum(purchase_price) FILTER (WHERE status = 'DANADA'), 0)::text                          AS "damagedValue",
               count(*) FILTER (WHERE ownership = 'PROPIA')::int                                                AS "purchasesCount",
               coalesce(sum(purchase_price) FILTER (WHERE ownership = 'PROPIA'), 0)::text                       AS "purchasesValue",
               coalesce(sum(purchase_price) FILTER (WHERE status NOT IN ('DANADA', 'EXTRAVIADA', 'DADA_DE_BAJA')), 0)::text AS "inventoryValue"
        FROM tools GROUP BY organization_id`,
      this.prisma.$queryRaw<{ org: string; status: ToolStatus; count: number }[]>`
        SELECT organization_id AS org, status::text AS status, count(*)::int AS count FROM tools GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ org: string | null; count: number }[]>`
        SELECT organization_id AS org, count(*)::int AS count FROM audit_log
        WHERE at >= now() - interval '30 days' GROUP BY 1`,
      this.prisma.user.count({ where: { role: "SUPERADMIN", active: true } }),
    ]);

    const byUsers = new Map(users.map((u) => [u.org, u]));
    const byTools = new Map(tools.map((t) => [t.org, t]));
    const byActivity = new Map(activity.map((a) => [a.org, a.count]));
    const byOrgStatus = new Map<string, Record<ToolStatus, number>>();
    for (const s of statuses) {
      const m = byOrgStatus.get(s.org) ?? (Object.fromEntries(TOOL_STATUS.map((k) => [k, 0])) as Record<ToolStatus, number>);
      m[s.status] = s.count;
      byOrgStatus.set(s.org, m);
    }

    const byOrganization: PlatformOrgStats[] = orgs.map((o) => {
      const u = byUsers.get(o.id);
      const t = byTools.get(o.id);
      return {
        organizationId: o.id,
        name: o.name,
        active: o.active,
        currency: o.currency,
        users: u?.users ?? 0,
        activeUsers: u?.active ?? 0,
        tools: t?.tools ?? 0,
        byStatus: byOrgStatus.get(o.id) ?? (Object.fromEntries(TOOL_STATUS.map((k) => [k, 0])) as Record<ToolStatus, number>),
        damaged: { count: t?.damagedCount ?? 0, value: t?.damagedValue ?? "0" },
        purchases: { count: t?.purchasesCount ?? 0, value: t?.purchasesValue ?? "0" },
        inventoryValue: t?.inventoryValue ?? "0",
        activity30d: byActivity.get(o.id) ?? 0,
      };
    });

    return {
      organizations: orgs.length,
      activeOrganizations: orgs.filter((o) => o.active).length,
      users: byOrganization.reduce((s, o) => s + o.users, 0),
      activeUsers: byOrganization.reduce((s, o) => s + o.activeUsers, 0),
      superadmins,
      tools: byOrganization.reduce((s, o) => s + o.tools, 0),
      activity30d: activity.reduce((s, a) => s + a.count, 0),
      currencies: [...new Set(orgs.map((o) => o.currency))],
      byOrganization,
    };
  }
}
