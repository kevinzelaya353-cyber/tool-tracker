import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "./errors.js";

/**
 * Contexto de cada petición autenticada. Lo fija `authenticate` y lo leen el cliente Prisma
 * con aislamiento (tenant-prisma.ts), las consultas SQL escritas a mano y la auditoría.
 */
export interface RequestContext {
  /** Organización en la que se ejecuta la petición. null = ninguna (SuperAdmin sin organización elegida). */
  orgId: string | null;
  /**
   * Alcance de plataforma: las consultas NO se filtran por organización. Solo lo activan los
   * módulos de plataforma (SuperAdmin), el inicio de sesión y las tareas internas, siempre de forma explícita.
   */
  platform: boolean;
  /** Usuario efectivo: con cuyos permisos se ejecuta la petición. */
  userId?: string;
  /** Usuario real: en una sesión de soporte, el SuperAdmin (distinto de userId). */
  actorId?: string;
  impersonationId?: string;
  ip?: string;
  userAgent?: string;
}

const store = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return store.run(ctx, fn);
}

export function currentContext(): RequestContext | undefined {
  return store.getStore();
}

/** Ejecuta `fn` sin filtro por organización, conservando los datos del usuario que la pide. */
export function runAsPlatform<T>(fn: () => T): T {
  const ctx = store.getStore();
  return store.run({ ...(ctx ?? {}), orgId: null, platform: true }, fn);
}

/** Ejecuta `fn` dentro de una organización concreta (p. ej. el SuperAdmin operando en ella). */
export function runInOrg<T>(orgId: string, fn: () => T): T {
  const ctx = store.getStore();
  return store.run({ ...(ctx ?? {}), orgId, platform: false }, fn);
}

/** Organización de la petición; para consultas SQL escritas a mano, que no pasan por el filtro automático. */
export function requireOrgId(): string {
  const ctx = store.getStore();
  if (!ctx?.orgId) throw orgRequired();
  return ctx.orgId;
}

export const orgRequired = () =>
  AppError.badRequest("ORG_REQUIRED", "Elige una organización para trabajar con sus datos");
