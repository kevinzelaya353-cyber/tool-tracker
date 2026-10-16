import type { ToolStatus } from "./enums.js";

/** Contratos de respuesta de /api/reports (los montos van como string decimal). */

export interface ReportSummary {
  byStatus: Record<ToolStatus, { count: number; value: string }>;
  /** Valor de compra de lo que sigue en uso o recuperable (bodega, proyecto, mantenimiento). */
  inventoryValue: string;
  /** Valor de compra de lo dañado, extraviado o dado de baja. */
  lossValue: string;
  purchaseTotal: string;
  /** Mantenimiento y reparaciones registrados en eventos. */
  maintenanceTotal: string;
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
