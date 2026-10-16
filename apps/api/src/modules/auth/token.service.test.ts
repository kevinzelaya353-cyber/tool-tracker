import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Role } from "@tt/shared";
import { type RefreshTokenStore, type StoredRefreshToken, TokenService } from "./token.service.js";

function memoryStore() {
  const rows = new Map<string, StoredRefreshToken & { tokenHash: string }>();
  const store: RefreshTokenStore = {
    findByHash: async (h) => [...rows.values()].find((r) => r.tokenHash === h) ?? null,
    create: async (d) => {
      const id = randomUUID();
      rows.set(id, { id, revokedAt: null, ...d });
    },
    revokeIfActive: async (id) => {
      const r = rows.get(id);
      if (!r || r.revokedAt) return false;
      r.revokedAt = new Date();
      return true;
    },
    revokeFamily: async (f) => rows.forEach((r) => r.family === f && (r.revokedAt ??= new Date())),
    revokeAllForUser: async (u) => rows.forEach((r) => r.userId === u && (r.revokedAt ??= new Date())),
  };
  return { store, rows };
}

const cfg = {
  accessSecret: "a".repeat(40),
  refreshSecret: "r".repeat(40),
  accessTtlMin: 15,
  refreshTtlDays: 30,
};

const user = { id: randomUUID(), role: "BODEGUERO" as Role, active: true };
const loadUser = async () => user;

describe("TokenService", () => {
  let mem: ReturnType<typeof memoryStore>;
  let svc: TokenService;

  beforeEach(() => {
    mem = memoryStore();
    svc = new TokenService(cfg, mem.store);
    user.active = true;
  });

  it("firma y verifica el access token", async () => {
    const { accessToken } = await svc.issue({ userId: user.id, role: user.role });
    await expect(svc.verifyAccess(accessToken)).resolves.toEqual({ userId: user.id, role: "BODEGUERO" });
  });

  it("rechaza access token firmado con otra clave", async () => {
    const other = new TokenService({ ...cfg, accessSecret: "x".repeat(40) }, mem.store);
    const token = await other.signAccess({ userId: user.id, role: "ADMIN" });
    await expect(svc.verifyAccess(token)).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza access token expirado", async () => {
    const token = await svc.signAccess({ userId: user.id, role: user.role });
    const later = new TokenService(cfg, mem.store, () => new Date(Date.now() + 16 * 60_000));
    await expect(later.verifyAccess(token)).rejects.toMatchObject({ status: 401 });
  });

  it("no guarda el refresh token en claro", async () => {
    const { refreshToken } = await svc.issue({ userId: user.id, role: user.role });
    const row = [...mem.rows.values()][0]!;
    expect(row.tokenHash).not.toContain(refreshToken);
  });

  it("rota: el token viejo queda revocado y el nuevo funciona", async () => {
    const first = await svc.issue({ userId: user.id, role: user.role });
    const second = await svc.rotate(first.refreshToken, loadUser);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(svc.rotate(second.refreshToken, loadUser)).resolves.toBeTruthy();
  });

  it("reutilizar un refresh token revoca toda la familia", async () => {
    const first = await svc.issue({ userId: user.id, role: user.role });
    const second = await svc.rotate(first.refreshToken, loadUser);

    await expect(svc.rotate(first.refreshToken, loadUser)).rejects.toMatchObject({
      status: 401,
      code: "REFRESH_REUSED",
    });
    // El token legítimo más reciente también queda invalidado.
    await expect(svc.rotate(second.refreshToken, loadUser)).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza refresh de un usuario desactivado", async () => {
    const first = await svc.issue({ userId: user.id, role: user.role });
    user.active = false;
    await expect(svc.rotate(first.refreshToken, loadUser)).rejects.toMatchObject({ status: 401 });
  });

  it("rechaza refresh expirado", async () => {
    const first = await svc.issue({ userId: user.id, role: user.role });
    const later = new TokenService(cfg, mem.store, () => new Date(Date.now() + 31 * 86_400_000));
    await expect(later.rotate(first.refreshToken, loadUser)).rejects.toMatchObject({ status: 401 });
  });

  it("toma el rol actual del usuario al rotar", async () => {
    const first = await svc.issue({ userId: user.id, role: "BODEGUERO" });
    const rotated = await svc.rotate(first.refreshToken, async () => ({ ...user, role: "LECTOR" }));
    await expect(svc.verifyAccess(rotated.accessToken)).resolves.toMatchObject({ role: "LECTOR" });
  });
});
