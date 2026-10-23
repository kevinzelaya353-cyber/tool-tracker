import type { EventType, ToolStatus } from "./enums.js";
import type { ReportMetric } from "./schemas.js";

/**
 * Contratos de respuesta de /api/reports (los montos van como string decimal).
 * Los montos son `null` cuando quien consulta no tiene permiso para ver valores (finance:read).
 */

export interface CountValue {
  count: number;
  value: string | null;
}

export interface ReportSummary {
  byStatus: Record<ToolStatus, CountValue>;
  /** Herramientas por ubicación actual (bodegas y proyectos), con los mismos filtros. */
  byLocation: { locationId: string; name: string; type: "BODEGA" | "PROYECTO"; count: number }[];
  /** Valor de compra de lo que sigue en uso o recuperable (bodega, proyecto, tránsito, mantenimiento). */
  inventoryValue: string | null;
  /**
   * Valor de ADQUISICIÓN de las herramientas que hoy están dañadas. No es una pérdida calculada:
   * el sistema no registra valor actual, de reposición ni pérdida estimada.
   */
  damaged: CountValue;
  /** Valor de adquisición de las extraviadas y dadas de baja (hoy). */
  lost: CountValue;
  /** Compatibilidad: dañadas + extraviadas + de baja. La app ya no lo suma con nada. */
  lossValue: string | null;
  /** Valor de adquisición de todas las herramientas propias (histórico). */
  purchaseTotal: string | null;
  /** Herramientas propias compradas dentro del periodo pedido (sin periodo: histórico). */
  purchases: CountValue;
  /** Mantenimiento y reparaciones registrados en eventos (en el periodo, si se pide). */
  maintenanceTotal: string | null;
}

export interface CategorySpendRow {
  categoryId: string;
  category: string;
  purchasedCount: number;
  purchaseTotal: string;
  maintenanceTotal: string;
  lossCount: number;
  lossTotal: string;
}

export interface SpendPeriodRow {
  /** Inicio del periodo, YYYY-MM-DD. */
  period: string;
  purchases: string;
  maintenance: string;
  losses: string;
}

export interface LossRow {
  toolId: string;
  code: string;
  category: string;
  brand: string;
  status: Extract<ToolStatus, "DANADA" | "EXTRAVIADA" | "DADA_DE_BAJA">;
  purchasePrice: string;
  lossAt: string | null;
  location: string | null;
}

export interface LossReport {
  totals: Record<LossRow["status"], { count: number; value: string }>;
  totalValue: string;
  rows: LossRow[];
}

/** Un registro detrás de una cifra del tablero: una herramienta o un gasto (evento). */
export interface ReportDetailRow {
  toolId: string;
  code: string;
  category: string;
  brand: string;
  model: string | null;
  status: ToolStatus;
  location: string | null;
  /** Compra, fecha del gasto o fecha en que se perdió, según la métrica. */
  date: string | null;
  value: string | null;
  /** Solo en mantenimiento: el evento que registró el gasto. */
  eventId?: string;
  eventType?: EventType;
  description?: string | null;
}

export interface ReportDetail {
  metric: ReportMetric;
  /** Registros que forman la cifra (todos, no solo la página). */
  count: number;
  /** Suma de la cifra (null sin permiso de ver valores). */
  totalValue: string | null;
  page: number;
  pageSize: number;
  rows: ReportDetailRow[];
}

// ---------- Plataforma ----------

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  currency: string;
  createdAt: string;
  users: number;
  tools: number;
}

export interface PlatformOrgStats {
  organizationId: string;
  name: string;
  active: boolean;
  currency: string;
  users: number;
  activeUsers: number;
  tools: number;
  byStatus: Record<ToolStatus, number>;
  damaged: { count: number; value: string };
  purchases: { count: number; value: string };
  inventoryValue: string;
  /** Acciones auditadas en los últimos 30 días. */
  activity30d: number;
}

export interface PlatformOverview {
  organizations: number;
  activeOrganizations: number;
  users: number;
  activeUsers: number;
  superadmins: number;
  tools: number;
  activity30d: number;
  /** Los montos de distintas organizaciones solo se suman si todas usan la misma moneda. */
  currencies: string[];
  byOrganization: PlatformOrgStats[];
}
