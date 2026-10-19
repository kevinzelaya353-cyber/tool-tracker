import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localFilesRouter, localStorage } from "./local-storage.js";

describe("almacenamiento local", () => {
  let dir: string;
  const secret = "s".repeat(40);
  let app: express.Express;
  let storage: ReturnType<typeof localStorage>;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "tt-files-"));
    storage = localStorage({ dir, publicBaseUrl: "http://api.test", signingSecret: secret });
    app = express();
    app.use("/files", localFilesRouter({ dir, signingSecret: secret }));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const key = () => `photos/2026/10/${randomUUID()}.jpg`;
  const pathOf = (url: string) => url.replace("http://api.test", "");

  it("guarda y sirve un archivo con URL firmada", async () => {
    const k = key();
    await storage.put(k, Buffer.from([0xff, 0xd8, 0xff, 0x01]), "image/jpeg");
    const res = await request(app).get(pathOf(await storage.signedUrl(k, 60)));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
  });

  it("rechaza firma alterada, URL expirada y sin firma", async () => {
    const k = key();
    await storage.put(k, Buffer.from("x"), "image/jpeg");
    const url = pathOf(await storage.signedUrl(k, 60));
    // Cambiar el primer carácter de la firma por otro distinto (con "Z" fijo, 1 de cada 64 firmas no cambiaba).
    const tampered = url.replace(/sig=(.)/, (_m, c: string) => `sig=${c === "A" ? "B" : "A"}`);
    expect(tampered).not.toBe(url);
    expect((await request(app).get(tampered)).status).toBe(403);
    expect((await request(app).get(pathOf(await storage.signedUrl(k, -10)))).status).toBe(403);
    expect((await request(app).get(`/files/${k}`)).status).toBe(403);
  });

  it("una firma válida no sirve para otro archivo", async () => {
    const [a, b] = [key(), key()];
    await storage.put(a, Buffer.from("a"), "image/jpeg");
    await storage.put(b, Buffer.from("b"), "image/jpeg");
    const url = pathOf(await storage.signedUrl(a, 60)).replace(a, b);
    expect((await request(app).get(url)).status).toBe(403);
  });

  it("impide path traversal", async () => {
    await expect(storage.put("../../evil.jpg", Buffer.from("x"), "image/jpeg")).rejects.toThrow();
    expect((await request(app).get("/files/..%2F..%2Fpackage.json?exp=9999999999&sig=x")).status).toBe(403);
  });

  it("remove borra el archivo", async () => {
    const k = key();
    await storage.put(k, Buffer.from("x"), "image/jpeg");
    const url = pathOf(await storage.signedUrl(k, 60));
    await storage.remove([k]);
    expect((await request(app).get(url)).status).toBe(404);
  });
});
