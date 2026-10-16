import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import type { ObjectStorage } from "./storage.js";

/**
 * Almacenamiento en disco para desarrollo sin MinIO/S3.
 * Mantiene el mismo modelo de seguridad que el bucket privado: los archivos solo se
 * leen con URLs firmadas (HMAC) que caducan, servidas por la propia API en /files/….
 */

// Las claves las genera el servidor; aun así se valida el formato para impedir path traversal.
const KEY_RE = /^photos\/\d{4}\/\d{2}\/[0-9a-f-]{36}(_thumb)?\.jpg$/;

export interface LocalStorageConfig {
  dir: string; // carpeta raíz absoluta
  publicBaseUrl: string; // URL de la API alcanzable por el teléfono, p. ej. http://192.168.1.50:3000
  signingSecret: string;
}

const sign = (secret: string, key: string, exp: number) =>
  createHmac("sha256", secret).update(`files:${key}:${exp}`).digest("base64url");

function resolveKey(dir: string, key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Clave de archivo inválida");
  return path.join(dir, ...key.split("/"));
}

export function localStorage(cfg: LocalStorageConfig): ObjectStorage {
  const base = cfg.publicBaseUrl.replace(/\/$/, "");
  return {
    async put(key, body) {
      const file = resolveKey(cfg.dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
    },
    async remove(keys) {
      await Promise.all(keys.map((k) => rm(resolveKey(cfg.dir, k), { force: true })));
    },
    async signedUrl(key, ttlSec) {
      const exp = Math.floor(Date.now() / 1000) + ttlSec;
      return `${base}/files/${key}?exp=${exp}&sig=${sign(cfg.signingSecret, key, exp)}`;
    },
  };
}

/** Sirve los archivos firmados. Montar fuera de /api (no usa token: la firma es la autorización). */
export function localFilesRouter(cfg: Pick<LocalStorageConfig, "dir" | "signingSecret">) {
  const r = Router();
  r.get("/*key", (req, res) => {
    const key = ([] as string[]).concat((req.params as { key: string | string[] }).key).join("/");
    const exp = Number(req.query.exp);
    const sig = String(req.query.sig ?? "");

    const expected = Buffer.from(sign(cfg.signingSecret, key, exp));
    const given = Buffer.from(sig);
    const valid =
      KEY_RE.test(key) &&
      Number.isFinite(exp) &&
      exp >= Date.now() / 1000 &&
      given.length === expected.length &&
      timingSafeEqual(given, expected);
    if (!valid) {
      res.status(403).json({ error: { code: "INVALID_SIGNATURE", message: "Enlace inválido o expirado" } });
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=600");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.sendFile(resolveKey(cfg.dir, key), { headers: { "Content-Type": "image/jpeg" } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: { code: "NOT_FOUND", message: "Archivo no encontrado" } });
    });
  });
  return r;
}
