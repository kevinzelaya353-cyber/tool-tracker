import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Role } from "@tt/shared";
import { currentContext } from "../lib/context.js";
import { AppError } from "../lib/errors.js";
import type { AccessClaims } from "../modules/auth/token.service.js";
import { errorHandler } from "./error-handler.js";
import { authenticate, authorize, forbidDuringImpersonation, type SessionGuard } from "./auth.js";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_OFF = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

/** Token falso "usuario:rol[:org[:flags]]"; flags: mcp (cambio obligatorio), imp (sesión de soporte). */
const fakeTokens = {
  verifyAccess: async (token: string): Promise<AccessClaims> => {
    const [userId, role, org, flags = ""] = token.split(":");
    if (!userId || !role) throw AppError.unauthorized("Token inválido o expirado");
    const claims: AccessClaims = { userId, role: role as Role, orgId: role === "SUPERADMIN" ? null : (org ?? ORG_A) };
    if (flags.includes("mcp")) claims.mustChangePassword = true;
    if (flags.includes("imp")) Object.assign(claims, { impersonationId: flags.includes("dead") ? "dead" : "live", actorId: "super" });
    return claims;
  },
};

const guard: SessionGuard = {
  organizationActive: async (id) => id !== ORG_OFF,
  organizationExists: async (id) => [ORG_A, ORG_B, ORG_OFF].includes(id),
  impersonationActive: async (id) => id === "live",
};

const app = express();
const auth = authenticate(fakeTokens, guard);
app.get("/read", auth, authorize("tools:read"), (_req, res) => {
  res.json({ ok: true });
});
app.get("/manage", auth, authorize("users:manage"), (_req, res) => {
  res.json({ ok: true });
});
app.get("/ctx", auth, async (_req, res) => {
  await Promise.resolve(); // el contexto sobrevive a los await
  res.json(currentContext());
});
app.post("/sensitive", auth, forbidDuringImpersonation, (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

const get = (path: string, token?: string, org?: string) => {
  const r = request(app).get(path);
  if (token) r.set("Authorization", `Bearer ${token}`);
  if (org) r.set("X-Org-Id", org);
  return r;
};

describe("authenticate / authorize", () => {
  it("sin Authorization → 401", async () => {
    expect((await request(app).get("/read")).status).toBe(401);
  });

  it("esquema distinto de Bearer → 401", async () => {
    expect((await request(app).get("/read").set("Authorization", "Basic abc")).status).toBe(401);
  });

  it("token inválido → 401", async () => {
    expect((await get("/read", "basura")).status).toBe(401);
  });

  it("rol con permiso → 200", async () => {
    expect((await get("/read", "u1:LECTOR")).status).toBe(200);
  });

  it("rol sin permiso → 403", async () => {
    const res = await get("/manage", "u1:BODEGUERO");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("ADMIN accede a gestión de usuarios", async () => {
    expect((await get("/manage", "u1:ADMIN")).status).toBe(200);
  });
});

describe("contexto de organización", () => {
  it("la organización sale del token, no del cliente", async () => {
    const res = await get("/ctx", `u1:BODEGUERO:${ORG_A}`);
    expect(res.body).toMatchObject({ orgId: ORG_A, platform: false, userId: "u1", actorId: "u1" });
  });

  it("un usuario de organización no puede elegir otra con X-Org-Id", async () => {
    const res = await get("/ctx", `u1:ADMIN:${ORG_A}`, ORG_B);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORG_MISMATCH");
    expect((await get("/ctx", `u1:ADMIN:${ORG_A}`, ORG_A)).status).toBe(200);
  });

  it("el SuperAdmin opera sin organización o en la que elija (si existe)", async () => {
    expect((await get("/ctx", "s1:SUPERADMIN")).body).toMatchObject({ orgId: null, platform: false });
    expect((await get("/ctx", "s1:SUPERADMIN", ORG_B)).body).toMatchObject({ orgId: ORG_B });
    expect((await get("/ctx", "s1:SUPERADMIN", "no-es-uuid")).status).toBe(404);
    expect((await get("/ctx", "s1:SUPERADMIN", "dddddddd-dddd-4ddd-8ddd-dddddddddddd")).status).toBe(404);
  });

  it("una organización desactivada no puede usar la API", async () => {
    const res = await get("/read", `u1:LECTOR:${ORG_OFF}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORG_INACTIVE");
  });

  it("quien debe cambiar su credencial solo puede hacer eso", async () => {
    const res = await get("/read", `u1:LECTOR:${ORG_A}:mcp`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
  });

  it("sesión de soporte: actor real en el contexto, revocable y sin operaciones sensibles", async () => {
    const ok = await get("/ctx", `u1:BODEGUERO:${ORG_A}:imp`);
    expect(ok.body).toMatchObject({ userId: "u1", actorId: "super", impersonationId: "live" });
    expect((await get("/read", `u1:BODEGUERO:${ORG_A}:imp-dead`)).body.error.code).toBe("IMPERSONATION_ENDED");
    const sensitive = await request(app).post("/sensitive").set("Authorization", `Bearer u1:ADMIN:${ORG_A}:imp`);
    expect(sensitive.body.error.code).toBe("IMPERSONATION_FORBIDDEN");
    expect((await request(app).post("/sensitive").set("Authorization", `Bearer u1:ADMIN:${ORG_A}`)).status).toBe(200);
  });
});
