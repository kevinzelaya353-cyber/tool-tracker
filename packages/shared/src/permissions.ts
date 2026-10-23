import type { Role } from "./enums.js";

/** Permisos dentro de una organización. */
export const TENANT_PERMISSION = [
  "tools:read",
  "tools:write",
  "tools:financial", // corregir precio/fecha de compra de una herramienta ya registrada
  "finance:read", // ver valores monetarios: precios, costos y reportes en dinero
  "transfers:read",
  "transfers:create",
  "transfers:receive", // confirmar la recepción de un traslado en tránsito (propia o con el PIN de quien recibe)
  "transfers:override", // confirmar una recepción en nombre de quien debía recibir
  "lifecycle:create", // daño, extravío, mantenimiento, recuperación
  "lifecycle:decommission", // dar de baja (afecta el inventario contable)
  "catalog:write", // proyectos/bodegas, vehículos, categorías
  "reports:read",
  "users:read",
  "users:manage",
  "audit:read", // auditoría de su propia organización
] as const;

/** Permisos globales: solo el SuperAdmin. */
export const PLATFORM_PERMISSION = [
  "platform:organizations", // crear, editar, activar y desactivar organizaciones
  "platform:users", // administrar usuarios de cualquier organización y a otros SuperAdmin
  "platform:audit", // auditoría de todas las organizaciones
  "platform:impersonate", // acceder como otro usuario (sesión de soporte)
] as const;

export const PERMISSION = [...TENANT_PERMISSION, ...PLATFORM_PERMISSION] as const;
export type Permission = (typeof PERMISSION)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPERADMIN: PERMISSION,
  ADMIN: TENANT_PERMISSION,
  BODEGUERO: [
    "tools:read",
    "tools:write",
    "transfers:read",
    "transfers:create",
    "transfers:receive",
    "transfers:override",
    "lifecycle:create",
    "catalog:write",
    "reports:read",
    "users:read",
  ],
  SUPERVISOR: [
    "tools:read",
    "transfers:read",
    "transfers:create",
    "transfers:receive",
    "lifecycle:create",
    "reports:read",
    "users:read",
  ],
  // Mueve herramientas entre proyectos; no las da de alta ni reporta eventos.
  CHOFER: ["tools:read", "transfers:read", "transfers:create", "transfers:receive", "users:read"],
  LECTOR: ["tools:read", "transfers:read", "reports:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
