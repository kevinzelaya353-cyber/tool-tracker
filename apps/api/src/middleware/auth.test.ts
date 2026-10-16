import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Role } from "@tt/shared";
import { AppError } from "../lib/errors.js";
import { errorHandler } from "./error-handler.js";
import { authenticate, authorize } from "./auth.js";

const fakeTokens = {
  verifyAccess: async (token: string) => {
    const [userId, role] = token.split(":");
    if (!userId || !role) throw AppError.unauthorized("Token inválido o expirado");
    return { userId, role: role as Role };
  },
};

const app = express();
app.get("/read", authenticate(fakeTokens), authorize("tools:read"), (_req, res) => {
  res.json({ ok: true });
});
app.get("/manage", authenticate(fakeTokens), authorize("users:manage"), (_req, res) => {
  res.json({ ok: true });
});
app.use(errorHandler);

describe("authenticate / authorize", () => {
  it("sin Authorization → 401", async () => {
    expect((await request(app).get("/read")).status).toBe(401);
  });

  it("esquema distinto de Bearer → 401", async () => {
    expect((await request(app).get("/read").set("Authorization", "Basic abc")).status).toBe(401);
  });

  it("token inválido → 401", async () => {
    expect((await request(app).get("/read").set("Authorization", "Bearer basura")).status).toBe(401);
  });

  it("rol con permiso → 200", async () => {
    const res = await request(app).get("/read").set("Authorization", "Bearer u1:LECTOR");
    expect(res.status).toBe(200);
  });

  it("rol sin permiso → 403", async () => {
    const res = await request(app).get("/manage").set("Authorization", "Bearer u1:BODEGUERO");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("ADMIN accede a gestión de usuarios", async () => {
    const res = await request(app).get("/manage").set("Authorization", "Bearer u1:ADMIN");
    expect(res.status).toBe(200);
  });
});
