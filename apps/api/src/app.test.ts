import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp({ NODE_ENV: "test", CORS_ORIGINS: [] });

describe("app base", () => {
  it("GET /health responde ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("no expone x-powered-by y aplica cabeceras de helmet", async () => {
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("ruta inexistente → 404 con formato de error estándar", async () => {
    const res = await request(app).get("/api/nada");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("JSON mal formado → 400 sin filtrar detalles internos", async () => {
    const res = await request(app)
      .post("/api/nada")
      .set("Content-Type", "application/json")
      .send("{malo");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});
