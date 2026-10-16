import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CategorySpendRow,
  LossReport,
  LossRow,
  ReportFilterQuery,
  ReportRangeQuery,
  ReportSummary,
  SpendPeriodRow,
  ToolStatus,
} from "@tt/shared";
import { fillByStatus, LOSS_STATUS_LIST, MAINTENANCE_COST_EVENTS } from "./report-helpers.js";

/**
 * Reportes financieros. Todo el cálculo monetario se hace en PostgreSQL sobre
 * NUMERIC y se devuelve como texto, sin pasar por floats de JS.
 *
 * Definición de pérdida: herramienta que HOY está dañada, extraviada o dada de baja,
 * valorada a su precio de compra y fechada en el evento que la sacó de un estado sano.
 * Si se repara o se recupera, deja de contar como pérdida automáticamente.
 */
export class ReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tz: string,
  ) {}

  private lossStatuses = Prisma.join(LOSS_STATUS_LIST.map((s) => Prisma.sql`${s}::"ToolStatus"`));
  private maintenanceTypes = Prisma.join(MAINTENANCE_COST_EVENTS.map((t) => Prisma.sql`${t}::"EventType"`));

  /** CTE `loss`: herramientas en pérdida con su fecha de pérdida. */
  private lossCte() {
    return Prisma.sql`
      loss AS (
        SELECT t.id, t.category_id, t.status, t.purchase_price, t.current_location_id,
               (SELECT max(e.occurred_at) FROM lifecycle_events e
                 WHERE e.tool_id = t.id
                   AND e.to_status IN (${this.lossStatuses})
                   AND (e.from_status IS NULL OR e.from_status NOT IN (${this.lossStatuses}))) AS loss_at
        FROM tools t
        WHERE t.status IN (${this.lossStatuses})
      )`;
  }

  // Filtros de rango (NULL = sin límite). `col` es siempre un literal interno, nunca entrada del usuario.
  private tsRange(col: string, q: ReportFilterQuery) {
    const c = Prisma.raw(col);
    return Prisma.sql`(${q.from ?? null}::timestamptz IS NULL OR ${c} >= ${q.from ?? null}::timestamptz)
                  AND (${q.to ?? null}::timestamptz IS NULL OR ${c} <= ${q.to ?? null}::timestamptz)`;
  }

  private dateRange(col: string, q: ReportFilterQuery) {
    const c = Prisma.raw(col);
    const from = q.from ?? null;
    const to = q.to ?? null;
    return Prisma.sql`(${from}::timestamptz IS NULL OR ${c} >= (${from}::timestamptz AT TIME ZONE ${this.tz})::date)
                  AND (${to}::timestamptz IS NULL OR ${c} <= (${to}::timestamptz AT TIME ZONE ${this.tz})::date)`;
  }

  async summary(): Promise<ReportSummary> {
    const [byStatus, totals] = await Promise.all([
      this.prisma.$queryRaw<{ status: ToolStatus; count: number; value: string }[]>`
        SELECT status::text AS status, count(*)::int AS count, coalesce(sum(purchase_price), 0)::text AS value
        FROM tools GROUP BY status`,
      this.prisma.$queryRaw<{ inventoryValue: string; lossValue: string; purchaseTotal: string; maintenanceTotal: string }[]>`
        SELECT
          coalesce(sum(purchase_price) FILTER (WHERE status NOT IN (${this.lossStatuses})), 0)::text AS "inventoryValue",
          coalesce(sum(purchase_price) FILTER (WHERE status IN (${this.lossStatuses})), 0)::text     AS "lossValue",
          coalesce(sum(purchase_price), 0)::text                                                      AS "purchaseTotal",
          (SELECT coalesce(sum(cost), 0) FROM lifecycle_events WHERE type IN (${this.maintenanceTypes}))::text AS "maintenanceTotal"
        FROM tools`,
    ]);
    return { byStatus: fillByStatus(byStatus), ...totals[0]! };
  }

  /** Gasto acumulado por tipo de herramienta (compras, mantenimiento y pérdidas) en el periodo. */
  byCategory(q: ReportFilterQuery): Promise<CategorySpendRow[]> {
    return this.prisma.$queryRaw<CategorySpendRow[]>`
      WITH ${this.lossCte()}
      SELECT c.id AS "categoryId",
             c.name AS category,
             count(t.id) FILTER (WHERE ${this.dateRange("t.purchase_date", q)})::int AS "purchasedCount",
             coalesce(sum(t.purchase_price) FILTER (WHERE ${this.dateRange("t.purchase_date", q)}), 0)::text AS "purchaseTotal",
             coalesce((SELECT sum(e.cost) FROM lifecycle_events e JOIN tools t2 ON t2.id = e.tool_id
                        WHERE t2.category_id = c.id AND e.type IN (${this.maintenanceTypes})
                          AND ${this.tsRange("e.occurred_at", q)}), 0)::text AS "maintenanceTotal",
             (SELECT count(*) FROM loss l WHERE l.category_id = c.id AND ${this.tsRange("l.loss_at", q)})::int AS "lossCount",
             coalesce((SELECT sum(l.purchase_price) FROM loss l
                        WHERE l.category_id = c.id AND ${this.tsRange("l.loss_at", q)}), 0)::text AS "lossTotal"
      FROM tool_categories c
      LEFT JOIN tools t ON t.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY coalesce(sum(t.purchase_price) FILTER (WHERE ${this.dateRange("t.purchase_date", q)}), 0) DESC, c.name`;
  }

  /** Serie mensual o anual de compras, mantenimiento y pérdidas, con periodos vacíos en cero. */
  overTime(q: ReportRangeQuery): Promise<SpendPeriodRow[]> {
    const g = q.granularity;
    return this.prisma.$queryRaw<SpendPeriodRow[]>`
      WITH periods AS (
        SELECT generate_series(
                 date_trunc(${g}::text, ${q.from}::timestamptz AT TIME ZONE ${this.tz}),
                 date_trunc(${g}::text, ${q.to}::timestamptz AT TIME ZONE ${this.tz}),
                 ('1 ' || ${g}::text)::interval) AS p
      ),
      ${this.lossCte()},
      pur AS (
        SELECT date_trunc(${g}::text, purchase_date::timestamp) AS p, sum(purchase_price) AS v
        FROM tools GROUP BY 1
      ),
      mnt AS (
        SELECT date_trunc(${g}::text, occurred_at AT TIME ZONE ${this.tz}) AS p, sum(cost) AS v
        FROM lifecycle_events
        WHERE type IN (${this.maintenanceTypes}) AND cost IS NOT NULL
        GROUP BY 1
      ),
      los AS (
        SELECT date_trunc(${g}::text, loss_at AT TIME ZONE ${this.tz}) AS p, sum(purchase_price) AS v
        FROM loss WHERE loss_at IS NOT NULL GROUP BY 1
      )
      SELECT to_char(periods.p, 'YYYY-MM-DD') AS period,
             coalesce(pur.v, 0)::text AS purchases,
             coalesce(mnt.v, 0)::text AS maintenance,
             coalesce(los.v, 0)::text AS losses
      FROM periods
      LEFT JOIN pur ON pur.p = periods.p
      LEFT JOIN mnt ON mnt.p = periods.p
      LEFT JOIN los ON los.p = periods.p
      ORDER BY periods.p`;
  }

  /** Control de pérdidas: detalle y totales por estado (dañada, extraviada, baja). */
  async losses(q: ReportFilterQuery): Promise<LossReport> {
    const [totals, grand, rows] = await Promise.all([
      this.prisma.$queryRaw<{ status: LossRow["status"]; count: number; value: string }[]>`
        WITH ${this.lossCte()}
        SELECT status::text AS status, count(*)::int AS count, coalesce(sum(purchase_price), 0)::text AS value
        FROM loss WHERE ${this.tsRange("loss_at", q)}
        GROUP BY status`,
      this.prisma.$queryRaw<{ total: string }[]>`
        WITH ${this.lossCte()}
        SELECT coalesce(sum(purchase_price), 0)::text AS total FROM loss WHERE ${this.tsRange("loss_at", q)}`,
      this.prisma.$queryRaw<LossRow[]>`
        WITH ${this.lossCte()}
        SELECT l.id AS "toolId", t.code, c.name AS category, t.brand, l.status::text AS status,
               l.purchase_price::text AS "purchasePrice", l.loss_at AS "lossAt", loc.name AS location
        FROM loss l
        JOIN tools t ON t.id = l.id
        JOIN tool_categories c ON c.id = t.category_id
        LEFT JOIN locations loc ON loc.id = l.current_location_id
        WHERE ${this.tsRange("l.loss_at", q)}
        ORDER BY l.loss_at DESC NULLS LAST
        LIMIT 500`,
    ]);

    const byStatus = Object.fromEntries(
      LOSS_STATUS_LIST.map((s) => [s, { count: 0, value: "0.00" }]),
    ) as LossReport["totals"];
    for (const t of totals) byStatus[t.status] = { count: t.count, value: t.value };

    return { totals: byStatus, totalValue: grand[0]?.total ?? "0", rows };
  }
}
