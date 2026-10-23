import { describe, expect, it } from "vitest";
import { ROLE, TENANT_ROLE } from "./enums.js";
import { PERMISSION, PLATFORM_PERMISSION, TENANT_PERMISSION, can } from "./permissions.js";

describe("permisos por rol", () => {
  it("SUPERADMIN tiene todos los permisos, incluidos los de plataforma", () => {
    for (const p of PERMISSION) expect(can("SUPERADMIN", p)).toBe(true);
  });

  it("ADMIN tiene todos los permisos de su organización y ninguno de plataforma", () => {
    for (const p of TENANT_PERMISSION) expect(can("ADMIN", p)).toBe(true);
    for (const p of PLATFORM_PERMISSION) expect(can("ADMIN", p)).toBe(false);
  });

  it("ningún rol de organización tiene permisos de plataforma", () => {
    for (const role of TENANT_ROLE) for (const p of PLATFORM_PERMISSION) expect(can(role, p)).toBe(false);
  });

  it("solo ADMIN (y SUPERADMIN) gestiona usuarios, da de baja, lee auditoría y ve montos", () => {
    for (const role of ROLE.filter((r) => r !== "ADMIN" && r !== "SUPERADMIN")) {
      expect(can(role, "users:manage")).toBe(false);
      expect(can(role, "lifecycle:decommission")).toBe(false);
      expect(can(role, "audit:read")).toBe(false);
      expect(can(role, "tools:financial")).toBe(false);
      expect(can(role, "finance:read")).toBe(false);
    }
  });

  it("LECTOR no puede escribir nada", () => {
    expect(PERMISSION.filter((p) => can("LECTOR", p)).every((p) => p.endsWith(":read"))).toBe(true);
  });

  it("SUPERVISOR registra traslados pero no edita herramientas ni catálogos", () => {
    expect(can("SUPERVISOR", "transfers:create")).toBe(true);
    expect(can("SUPERVISOR", "tools:write")).toBe(false);
    expect(can("SUPERVISOR", "catalog:write")).toBe(false);
  });

  it("CHOFER traslada y entrega, pero no da de alta, no reporta eventos ni confirma por otros", () => {
    expect(can("CHOFER", "transfers:create")).toBe(true);
    expect(can("CHOFER", "transfers:receive")).toBe(true);
    expect(can("CHOFER", "transfers:override")).toBe(false);
    expect(can("CHOFER", "tools:write")).toBe(false);
    expect(can("CHOFER", "lifecycle:create")).toBe(false);
  });
});
