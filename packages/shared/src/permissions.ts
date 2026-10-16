import type { Role } from "./enums.js";

export const PERMISSION = [
  "tools:read",
  "tools:write",
  "tools:financial", // corregir precio/fecha de compra de una herramienta ya registrada
  "transfers:read",
  "transfers:create",
  "lifecycle:create", // daño, extravío, mantenimiento, recuperación
  "lifecycle:decommission", // dar de baja (afecta el inventario contable)
  "catalog:write", // proyectos/bodegas, vehículos, categorías
  "reports:read",
  "users:read",
  "users:manage",
  "audit:read",
] as const;
export type Permission = (typeof PERMISSION)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSION,
  BODEGUERO: [
    "tools:read",
    "tools:write",
    "transfers:read",
    "transfers:create",
    "lifecycle:create",
    "catalog:write",
    "reports:read",
    "users:read",
  ],
  SUPERVISOR: [
    "tools:read",
    "transfers:read",
    "transfers:create",
    "lifecycle:create",
    "reports:read",
    "users:read",
  ],
  LECTOR: ["tools:read", "transfers:read", "reports:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
