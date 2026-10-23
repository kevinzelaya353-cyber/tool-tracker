import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  CategorySpendRow,
  CountValue,
  LossReport,
  LossRow,
  ReportDetail,
  ReportDetailQuery,
  ReportDetailRow,
  ReportFilterQuery,
  ReportRangeQuery,
  ReportSummary,
  SpendPeriodRow,
  ToolStatus,
} from "@tt/shared";
import { requireOrgId } from "../../lib/context.js";
import { fillByStatus, LOSS_STATUS_LIST, MAINTENANCE_COST_EVENTS } from "./report-helpers.js";

type Sql = Prisma.Sql;
type Scope = { categoryId?: string; locationId?: string };
type Range = { from?: Date; to?: Date };
/** Una barra de la serie (periodo + granularidad), igual a como la agrupa la gráfica. */
type Bucket = { period: string; granularity: "month" | "year" };

const LOST_ONLY = ["EXTRAVIADA", "DADA_DE_BAJA"] as const;

/**
 * Reportes financieros. Todo el cálculo monetario se hace en PostgreSQL sobre NUMERIC y se
 * devuelve como texto, sin pasar por floats de JS. TODAS las consultas se limitan a la
 * organización del contexto (SQL escrito a mano: no pasa por el filtro automático de Prisma).
 *
 * Cada cifra se define UNA vez (los fragmentos `*Where` de abajo) y la usan tanto el total del
 * tablero como su detalle (`details`): por construcción, el detalle suma exactamente lo mismo.
 *
 * Conceptos (no se mezclan):
 * - Compras: valor de ADQUISICIÓN de herramientas propias, por su fecha de compra. Las rentadas
 *   no son una compra (valen 0 y no cuentan).
 * - Dañadas / extraviadas / de baja: valor de adquisición de lo que HOY está en ese estado. No es una
 *   pérdida calculada (no hay valor actual, de reposición ni depreciación registrados).
 * - Pérdidas en el tiempo: misma valoración, fechada en el evento que la sacó de un estado sano.
 *   Si se repara o se recupera, deja de contar automáticamente.
 * - Mantenimiento: costos registrados en eventos de mantenimiento y daño.
 * Una herramienta comprada y luego dañada aparece en "compras" Y en "dañadas": son dos indicadores
 * independientes y la app nunca los suma entre sí.
 */
export class ReportsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tz: string,
  ) {}

  private lossStatuses = Prisma.join(LOSS_STATUS_LIST.map((s) => Prisma.sql`${s}::"ToolStatus"`));
  private lostOnly = Prisma.join(LOST_ONLY.map((s) => Prisma.sql`${s}::"ToolStatus"`));
  private maintenanceTypes = Prisma.join(MAINTENANCE_COST_EVENTS.map((t) => Prisma.sql`${t}::"EventType"`));

  // ---------- Definiciones compartidas ----------

  /** Organización, categoría y ubicación actual. `t` es siempre un alias interno, nunca entrada del usuario. */
  private toolScope(t: string, q: Scope): Sql {
    const a = Prisma.raw(t);
    const cat = q.categoryId ?? null;
    const loc = q.locationId ?? null;
    return Prisma.sql`${a}.organization_id = ${requireOrgId()}::uuid
      AND (${cat}::uuid IS NULL OR ${a}.category_id = ${cat}::uuid)
      AND (${loc}::uuid IS NULL OR ${a}.current_location_id = ${loc}::uuid)`;
  }

  // Filtros de rango (NULL = sin límite). `col` es siempre un literal interno.
  private tsRange(col: string, q: Range): Sql {
    const c = Prisma.raw(col);
    return Prisma.sql`(${q.from ?? null}::timestamptz IS NULL OR ${c} >= ${q.from ?? null}::timestamptz)
                  AND (${q.to ?? null}::timestamptz IS NULL OR ${c} <= ${q.to ?? null}::timestamptz)`;
  }

  private dateRange(col: string, q: Range): Sql {
    const c = Prisma.raw(col);
    const from = q.from ?? null;
    const to = q.to ?? null;
    return Prisma.sql`(${from}::timestamptz IS NULL OR ${c} >= (${from}::timestamptz AT TIME ZONE ${this.tz})::date)
                  AND (${to}::timestamptz IS NULL OR ${c} <= (${to}::timestamptz AT TIME ZONE ${this.tz})::date)`;
  }

  /** Inicio del periodo al que pertenece una fecha (DATE) o un instante (TIMESTAMPTZ) en la zona de los reportes. */
  private truncDate(col: string, g: string): Sql {
    return Prisma.sql`date_trunc(${g}::text, ${Prisma.raw(col)}::timestamp)`;
  }
  private truncTs(col: string, g: string): Sql {
    return Prisma.sql`date_trunc(${g}::text, ${Prisma.raw(col)} AT TIME ZONE ${this.tz})`;
  }

  /** Herramientas propias compradas: en el rango o, si se pide una barra, en ese periodo. */
  private purchaseWhere(t: string, q: Scope & Range, bucket?: Bucket): Sql {
    const period = bucket
      ? Prisma.sql`${this.truncDate(`${t}.purchase_date`, bucket.granularity)} = ${bucket.period}::timestamp`
      : this.dateRange(`${t}.purchase_date`, q);
    return Prisma.sql`${this.toolScope(t, q)} AND ${Prisma.raw(t)}.ownership = 'PROPIA' AND ${period}`;
  }

  /** Gastos de mantenimiento/reparación (evento `e` de la herramienta `t`). */
  private maintenanceWhere(q: Scope & Range, bucket?: Bucket): Sql {
    const period = bucket
      ? Prisma.sql`${this.truncTs("e.occurred_at", bucket.granularity)} = ${bucket.period}::timestamp`
      : this.tsRange("e.occurred_at", q);
    return Prisma.sql`${this.toolScope("t", q)} AND e.type IN (${this.maintenanceTypes}) AND e.cost IS NOT NULL AND ${period}`;
  }

  /** CTE `loss`: herramientas que HOY están en pérdida, con la fecha en que dejaron de estar sanas. */
  private lossCte(q: Scope): Sql {
    return Prisma.sql`
      loss AS (
        SELECT t.id, t.category_id, t.status, t.purchase_price, t.current_location_id,
               (SELECT max(e.occurred_at) FROM lifecycle_events e
                 WHERE e.tool_id = t.id
                   AND e.to_status IN (${this.lossStatuses})
                   AND (e.from_status IS NULL OR e.from_status NOT IN (${this.lossStatuses}))) AS loss_at
        FROM tools t
        WHERE ${this.toolScope("t", q)} AND t.status IN (${this.lossStatuses})
      )`;
  }

  private lossWhere(q: Range & { status?: ToolStatus }, bucket?: Bucket): Sql {
    const period = bucket
      ? Prisma.sql`${this.truncTs("l.loss_at", bucket.granularity)} = ${bucket.period}::timestamp`
      : this.tsRange("l.loss_at", q);
    const status = q.status ?? null;
    return Prisma.sql`${period} AND (${status}::text IS NULL OR l.status::text = ${status}::text)`;
  }

  // ---------- Tablero ----------

  /**
   * Indicadores del tablero. Los conteos por estado y ubicación son el estado ACTUAL; compras y
   * mantenimiento usan el periodo pedido (sin periodo: histórico). `values=false` (sin permiso de
   * ver montos) devuelve los conteos con los montos en null.
   */
  async summary(q: ReportFilterQuery = {}, values = true): Promise<ReportSummary> {
    const [byStatus, totals, maintenance, byLocation] = await Promise.all([
      this.prisma.$queryRaw<{ status: ToolStatus; count: number; value: string }[]>`
        SELECT t.status::text AS status, count(*)::int AS count, coalesce(sum(t.purchase_price), 0)::text AS value
        FROM tools t WHERE ${this.toolScope("t", q)} GROUP BY t.status`,
      this.prisma.$queryRaw<
        {
          inventoryValue: string;
          damagedCount: number;
          damagedValue: string;
          lostCount: number;
          lostValue: string;
          lossValue: string;
          purchaseTotal: string;
          purchasesCount: number;
          purchasesValue: string;
        }[]
      >`
        SELECT
          coalesce(sum(t.purchase_price) FILTER (WHERE t.status NOT IN (${this.lossStatuses})), 0)::text AS "inventoryValue",
          count(*) FILTER (WHERE t.status = 'DANADA')::int                                             AS "damagedCount",
          coalesce(sum(t.purchase_price) FILTER (WHERE t.status = 'DANADA'), 0)::text                  AS "damagedValue",
          count(*) FILTER (WHERE t.status IN (${this.lostOnly}))::int                                  AS "lostCount",
          coalesce(sum(t.purchase_price) FILTER (WHERE t.status IN (${this.lostOnly})), 0)::text       AS "lostValue",
          coalesce(sum(t.purchase_price) FILTER (WHERE t.status IN (${this.lossStatuses})), 0)::text   AS "lossValue",
          coalesce(sum(t.purchase_price) FILTER (WHERE t.ownership = 'PROPIA'), 0)::text               AS "purchaseTotal",
          count(*) FILTER (WHERE ${this.purchaseWhere("t", q)})::int                                   AS "purchasesCount",
          coalesce(sum(t.purchase_price) FILTER (WHERE ${this.purchaseWhere("t", q)}), 0)::text        AS "purchasesValue"
        FROM tools t WHERE ${this.toolScope("t", q)}`,
      this.prisma.$queryRaw<{ total: string }[]>`
        SELECT coalesce(sum(e.cost), 0)::text AS total
        FROM lifecycle_events e JOIN tools t ON t.id = e.tool_id
        WHERE ${this.maintenanceWhere(q)}`,
      this.prisma.$queryRaw<ReportSummary["byLocation"]>`
        SELECT loc.id AS "locationId", loc.name, loc.type::text AS type, count(t.id)::int AS count
        FROM tools t JOIN locations loc ON loc.id = t.current_location_id
        WHERE ${this.toolScope("t", q)}
        GROUP BY loc.id, loc.name, loc.type
        ORDER BY count(t.id) DESC, loc.name`,
    ]);
    const r = totals[0]!;
    const v = (x: string) => (values ? x : null);
    const cv = (count: number, value: string): CountValue => ({ count, value: v(value) });
    const status = fillByStatus(byStatus);
    return {
      byStatus: Object.fromEntries(Object.entries(status).map(([k, s]) => [k, cv(s.count, s.value)])) as ReportSummary["byStatus"],
      byLocation,
      inventoryValue: v(r.inventoryValue),
      damaged: cv(r.damagedCount, r.damagedValue),
      lost: cv(r.lostCount, r.lostValue),
      lossValue: v(r.lossValue),
      purchaseTotal: v(r.purchaseTotal),
      purchases: cv(r.purchasesCount, r.purchasesValue),
      maintenanceTotal: v(maintenance[0]?.total ?? "0"),
    };
  }

  /** Gasto acumulado por tipo de herramienta (compras, mantenimiento y pérdidas) en el periodo. */
  byCategory(q: ReportFilterQuery): Promise<CategorySpendRow[]> {
    const cat = q.categoryId ?? null;
    return this.prisma.$queryRaw<CategorySpendRow[]>`
      WITH ${this.lossCte(q)},
      cats AS (
        SELECT c.id, c.name,
               (SELECT count(*) FROM tools t WHERE t.category_id = c.id AND ${this.purchaseWhere("t", q)})::int AS purchased_count,
               (SELECT coalesce(sum(t.purchase_price), 0) FROM tools t WHERE t.category_id = c.id AND ${this.purchaseWhere("t", q)}) AS purchase_total,
               (SELECT coalesce(sum(e.cost), 0) FROM lifecycle_events e JOIN tools t ON t.id = e.tool_id
                 WHERE t.category_id = c.id AND ${this.maintenanceWhere(q)}) AS maintenance_total,
               (SELECT count(*) FROM loss l WHERE l.category_id = c.id AND ${this.lossWhere(q)})::int AS loss_count,
               (SELECT coalesce(sum(l.purchase_price), 0) FROM loss l WHERE l.category_id = c.id AND ${this.lossWhere(q)}) AS loss_total
        FROM tool_categories c
        WHERE c.organization_id = ${requireOrgId()}::uuid AND (${cat}::uuid IS NULL OR c.id = ${cat}::uuid)
      )
      SELECT id AS "categoryId", name AS category, purchased_count AS "purchasedCount", purchase_total::text AS "purchaseTotal",
             maintenance_total::text AS "maintenanceTotal", loss_count AS "lossCount", loss_total::text AS "lossTotal"
      FROM cats
      ORDER BY purchase_total DESC, name`;
  }

  /** Serie mensual o anual de compras, mantenimiento y pérdidas, con periodos vacíos en cero. */
  overTime(q: ReportRangeQuery & Scope): Promise<SpendPeriodRow[]> {
    const g = q.granularity;
    return this.prisma.$queryRaw<SpendPeriodRow[]>`
      WITH periods AS (
        SELECT generate_series(
                 date_trunc(${g}::text, ${q.from}::timestamptz AT TIME ZONE ${this.tz}),
                 date_trunc(${g}::text, ${q.to}::timestamptz AT TIME ZONE ${this.tz}),
                 ('1 ' || ${g}::text)::interval) AS p
      ),
      ${this.lossCte(q)},
      pur AS (
        SELECT ${this.truncDate("t.purchase_date", g)} AS p, sum(t.purchase_price) AS v
        FROM tools t WHERE ${this.toolScope("t", q)} AND t.ownership = 'PROPIA' GROUP BY 1
      ),
      mnt AS (
        SELECT ${this.truncTs("e.occurred_at", g)} AS p, sum(e.cost) AS v
        FROM lifecycle_events e JOIN tools t ON t.id = e.tool_id
        WHERE ${this.toolScope("t", q)} AND e.type IN (${this.maintenanceTypes}) AND e.cost IS NOT NULL
        GROUP BY 1
      ),
      los AS (
        SELECT ${this.truncTs("loss_at", g)} AS p, sum(purchase_price) AS v
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
        WITH ${this.lossCte(q)}
        SELECT l.status::text AS status, count(*)::int AS count, coalesce(sum(l.purchase_price), 0)::text AS value
        FROM loss l WHERE ${this.lossWhere(q)}
        GROUP BY l.status`,
      this.prisma.$queryRaw<{ total: string }[]>`
        WITH ${this.lossCte(q)}
        SELECT coalesce(sum(l.purchase_price), 0)::text AS total FROM loss l WHERE ${this.lossWhere(q)}`,
      this.prisma.$queryRaw<LossRow[]>`
        WITH ${this.lossCte(q)}
        SELECT l.id AS "toolId", t.code, c.name AS category, t.brand, l.status::text AS status,
               l.purchase_price::text AS "purchasePrice", l.loss_at AS "lossAt", loc.name AS location
        FROM loss l
        JOIN tools t ON t.id = l.id
        JOIN tool_categories c ON c.id = t.category_id
        LEFT JOIN locations loc ON loc.id = l.current_location_id
        WHERE ${this.lossWhere(q)}
        ORDER BY l.loss_at DESC NULLS LAST
        LIMIT 500`,
    ]);

    const byStatus = Object.fromEntries(
      LOSS_STATUS_LIST.map((s) => [s, { count: 0, value: "0.00" }]),
    ) as LossReport["totals"];
    for (const t of totals) byStatus[t.status] = { count: t.count, value: t.value };

    return { totals: byStatus, totalValue: grand[0]?.total ?? "0", rows };
  }

  // ---------- Detalle de una cifra ----------

  /**
   * Los registros que forman una cifra del tablero, con su cantidad y suma totales (no solo la
   * página). Usa las mismas definiciones que los totales: el detalle coincide con el gráfico.
   * `q.q` (búsqueda) solo acota el listado que se está viendo.
   */
  async details(q: ReportDetailQuery, values = true): Promise<ReportDetail> {
    const bucket: Bucket | undefined = q.period ? { period: q.period, granularity: q.granularity } : undefined;
    const term = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const search = Prisma.sql`(${term}::text IS NULL OR t.code ILIKE ${term} OR t.brand ILIKE ${term}
                              OR t.model ILIKE ${term} OR t.serial ILIKE ${term} OR c.name ILIKE ${term})`;
    const status = q.status ?? null;
    const statusIs = Prisma.sql`(${status}::text IS NULL OR t.status::text = ${status}::text)`;
    const offset = (q.page - 1) * q.pageSize;

    type Totals = { count: number; total: string };
    let totals: Totals[];
    let rows: ReportDetailRow[];

    const toolRow = (date: Sql, value: Sql) => Prisma.sql`
      SELECT t.id AS "toolId", t.code, c.name AS category, t.brand, t.model, t.status::text AS status,
             loc.name AS location, ${date} AS date, ${value}::text AS value`;
    const toolJoins = Prisma.sql`
      FROM tools t
      JOIN tool_categories c ON c.id = t.category_id
      LEFT JOIN locations loc ON loc.id = t.current_location_id`;

    switch (q.metric) {
      case "tools":
      case "inventory": {
        const where =
          q.metric === "inventory"
            ? Prisma.sql`${this.toolScope("t", q)} AND t.status NOT IN (${this.lossStatuses}) AND ${statusIs}`
            : Prisma.sql`${this.toolScope("t", q)} AND ${statusIs}`;
        [totals, rows] = await Promise.all([
          this.prisma.$queryRaw<Totals[]>`
            SELECT count(*)::int AS count, coalesce(sum(t.purchase_price), 0)::text AS total
            ${toolJoins} WHERE ${where} AND ${search}`,
          this.prisma.$queryRaw<ReportDetailRow[]>`
            ${toolRow(Prisma.sql`t.status_changed_at`, Prisma.sql`t.purchase_price`)}
            ${toolJoins} WHERE ${where} AND ${search}
            ORDER BY t.code LIMIT ${q.pageSize} OFFSET ${offset}`,
        ]);
        break;
      }
      case "purchases": {
        const where = Prisma.sql`${this.purchaseWhere("t", q, bucket)} AND ${statusIs}`;
        [totals, rows] = await Promise.all([
          this.prisma.$queryRaw<Totals[]>`
            SELECT count(*)::int AS count, coalesce(sum(t.purchase_price), 0)::text AS total
            ${toolJoins} WHERE ${where} AND ${search}`,
          this.prisma.$queryRaw<ReportDetailRow[]>`
            ${toolRow(Prisma.sql`t.purchase_date`, Prisma.sql`t.purchase_price`)}
            ${toolJoins} WHERE ${where} AND ${search}
            ORDER BY t.purchase_date DESC, t.code LIMIT ${q.pageSize} OFFSET ${offset}`,
        ]);
        break;
      }
      case "maintenance": {
        const where = Prisma.sql`${this.maintenanceWhere(q, bucket)} AND ${statusIs}`;
        const joins = Prisma.sql`
          FROM lifecycle_events e
          JOIN tools t ON t.id = e.tool_id
          JOIN tool_categories c ON c.id = t.category_id
          LEFT JOIN locations loc ON loc.id = t.current_location_id`;
        [totals, rows] = await Promise.all([
          this.prisma.$queryRaw<Totals[]>`
            SELECT count(*)::int AS count, coalesce(sum(e.cost), 0)::text AS total
            ${joins} WHERE ${where} AND ${search}`,
          this.prisma.$queryRaw<ReportDetailRow[]>`
            SELECT t.id AS "toolId", t.code, c.name AS category, t.brand, t.model, t.status::text AS status,
                   loc.name AS location, e.occurred_at AS date, e.cost::text AS value,
                   e.id AS "eventId", e.type::text AS "eventType", e.description
            ${joins} WHERE ${where} AND ${search}
            ORDER BY e.occurred_at DESC, e.id LIMIT ${q.pageSize} OFFSET ${offset}`,
        ]);
        break;
      }
      case "losses": {
        const where = this.lossWhere(q, bucket);
        const joins = Prisma.sql`
          FROM loss l
          JOIN tools t ON t.id = l.id
          JOIN tool_categories c ON c.id = t.category_id
          LEFT JOIN locations loc ON loc.id = t.current_location_id`;
        [totals, rows] = await Promise.all([
          this.prisma.$queryRaw<Totals[]>`
            WITH ${this.lossCte(q)}
            SELECT count(*)::int AS count, coalesce(sum(l.purchase_price), 0)::text AS total
            ${joins} WHERE ${where} AND ${search}`,
          this.prisma.$queryRaw<ReportDetailRow[]>`
            WITH ${this.lossCte(q)}
            ${toolRow(Prisma.sql`l.loss_at`, Prisma.sql`l.purchase_price`)}
            ${joins} WHERE ${where} AND ${search}
            ORDER BY l.loss_at DESC NULLS LAST, t.code LIMIT ${q.pageSize} OFFSET ${offset}`,
        ]);
        break;
      }
    }

    const t = totals[0] ?? { count: 0, total: "0" };
    return {
      metric: q.metric,
      count: t.count,
      totalValue: values ? t.total : null,
      page: q.page,
      pageSize: q.pageSize,
      rows: values ? rows : rows.map((r) => ({ ...r, value: null })),
    };
  }
}
