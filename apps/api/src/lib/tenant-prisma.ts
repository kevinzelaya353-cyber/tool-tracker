import type { PrismaClient } from "@prisma/client";
import { currentContext, orgRequired } from "./context.js";
import { AppError } from "./errors.js";

/**
 * Modelos que pertenecen a una organización (columna organization_id). TransferItem no la tiene:
 * solo se accede a través de su traslado y un trigger exige que la herramienta sea de la misma.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  "User",
  "Location",
  "Vehicle",
  "ToolCategory",
  "Tool",
  "Transfer",
  "LifecycleEvent",
  "DamageReport",
  "Rental",
  "Photo",
]);

/** Operaciones con `where`: se les agrega la organización (un id de otra organización da 404). */
const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

type Data = Record<string, unknown>;

const crossTenant = () => new AppError(409, "TENANT_MISMATCH", "El registro no pertenece a esta organización");

function withOrg(data: unknown, orgId: string): Data {
  const d = (data ?? {}) as Data;
  if ("organization" in d) throw crossTenant(); // la organización nunca se elige por relación
  if (d.organizationId !== undefined && d.organizationId !== orgId) throw crossTenant();
  return { ...d, organizationId: orgId };
}

function withoutOrgChange(data: unknown): unknown {
  const d = (data ?? {}) as Data;
  if ("organizationId" in d || "organization" in d) throw crossTenant();
  return data;
}

/** Agrega la organización a la consulta. Exportada para las pruebas unitarias. */
export function scopeArgs(operation: string, args: unknown, orgId: string): Data {
  const a: Data = { ...((args ?? {}) as Data) };
  if (WHERE_OPS.has(operation)) a.where = { ...((a.where ?? {}) as Data), organizationId: orgId };
  switch (operation) {
    case "create":
      a.data = withOrg(a.data, orgId);
      break;
    case "createMany":
    case "createManyAndReturn":
      a.data = Array.isArray(a.data) ? a.data.map((d) => withOrg(d, orgId)) : withOrg(a.data, orgId);
      break;
    case "upsert":
      a.create = withOrg(a.create, orgId);
      a.update = withoutOrgChange(a.update);
      break;
    case "update":
    case "updateMany":
    case "updateManyAndReturn":
      a.data = withoutOrgChange(a.data);
      break;
  }
  return a;
}

/**
 * Cliente Prisma con aislamiento por organización. Toda consulta a un modelo de organización
 * toma la organización del contexto de la petición (nunca del cliente HTTP):
 * - sin contexto → error (falla cerrado: una ruta nueva sin `authenticate` no puede leer datos);
 * - SuperAdmin sin organización elegida → 400 ORG_REQUIRED;
 * - alcance de plataforma (`runAsPlatform`) → sin filtro, solo en módulos que lo piden explícitamente.
 * Las consultas SQL escritas a mano ($queryRaw) no pasan por aquí: usan `requireOrgId()`.
 */
export function tenantScoped(prisma: PrismaClient): PrismaClient {
  const extended = prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);
          const ctx = currentContext();
          if (!ctx) throw new Error(`Consulta a ${model} sin contexto de organización`);
          if (ctx.platform) return query(args);
          if (!ctx.orgId) throw orgRequired();
          return query(scopeArgs(operation, args, ctx.orgId) as typeof args);
        },
      },
    },
  });
  // Solo agrega una extensión de consultas: la API de modelos es idéntica a la de PrismaClient.
  return extended as unknown as PrismaClient;
}
