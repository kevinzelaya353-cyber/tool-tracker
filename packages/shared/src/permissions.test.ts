import { describe, expect, it } from "vitest";
import { ROLE } from "./enums.js";
import { PERMISSION, can } from "./permissions.js";

describe("permisos por rol", () => {
  it("ADMIN tiene todos los permisos", () => {
    for (const p of PERMISSION) expect(can("ADMIN", p)).toBe(true);
  });

  it("solo ADMIN gestiona usuarios, da de baja y lee auditoría", () => {
    for (const role of ROLE.filter((r) => r !== "ADMIN")) {
      expect(can(role, "users:manage")).toBe(false);
      expect(can(role, "lifecycle:decommission")).toBe(false);
      expect(can(role, "audit:read")).toBe(false);
      expect(can(role, "tools:financial")).toBe(false);
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
});
