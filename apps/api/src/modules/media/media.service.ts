import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { processImage, type ProcessedImage } from "./image.js";
import type { ObjectStorage } from "./storage.js";

type Ctx = { actorId: string; ip?: string };

export interface MediaConfig {
  urlTtlSec: number;
  orphanTtlHours: number;
}

export class MediaService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storage: ObjectStorage,
    private readonly cfg: MediaConfig,
  ) {}

  /**
   * Procesa TODAS las imágenes antes de subir ninguna: si una es inválida se
   * rechaza la petición completa. Las fotos quedan "huérfanas" hasta que un
   * traslado o evento las asocia; las que nunca se asocian se purgan.
   */
  async upload(files: { buffer: Buffer }[], ctx: Ctx) {
    if (files.length === 0) throw AppError.badRequest("NO_FILES", "Adjunta al menos una foto en el campo 'photos'");

    const processed: ProcessedImage[] = [];
    for (const f of files) processed.push(await processImage(f.buffer)); // secuencial: acota uso de memoria/CPU

    const now = new Date();
    const prefix = `photos/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const rows = processed.map((img) => {
      const id = randomUUID(); // la clave nunca deriva del nombre enviado por el cliente
      return {
        id,
        storageKey: `${prefix}/${id}.jpg`,
        thumbKey: `${prefix}/${id}_thumb.jpg`,
        mime: "image/jpeg",
        sizeBytes: img.full.length,
        width: img.width,
        height: img.height,
        uploadedById: ctx.actorId,
        img,
      };
    });

    const uploaded: string[] = [];
    try {
      for (const r of rows) {
        await this.storage.put(r.storageKey, r.img.full, r.mime);
        uploaded.push(r.storageKey);
        await this.storage.put(r.thumbKey, r.img.thumb, r.mime);
        uploaded.push(r.thumbKey);
      }
      await this.prisma.photo.createMany({
        data: rows.map((r) => ({
          id: r.id,
          storageKey: r.storageKey,
          thumbKey: r.thumbKey,
          mime: r.mime,
          sizeBytes: r.sizeBytes,
          width: r.width,
          height: r.height,
          uploadedById: r.uploadedById,
        })),
      });
    } catch (err) {
      await this.storage.remove(uploaded).catch(() => undefined); // limpieza best-effort
      throw err;
    }

    await audit(this.prisma, {
      actorId: ctx.actorId,
      action: "media.upload",
      entity: "photo",
      diff: { ids: rows.map((r) => r.id), bytes: rows.reduce((s, r) => s + r.sizeBytes, 0) },
      ip: ctx.ip,
    });

    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        width: r.width,
        height: r.height,
        thumbUrl: await this.storage.signedUrl(r.thumbKey, this.cfg.urlTtlSec),
      })),
    );
  }

  /**
   * URLs firmadas para varias fotos (la app las pide en lote al mostrar un historial).
   * Las fotos aún no asociadas solo son visibles para quien las subió.
   */
  async signedUrls(ids: string[], variant: "full" | "thumb", actorId: string) {
    const photos = await this.prisma.photo.findMany({
      where: {
        id: { in: ids },
        OR: [
          { uploadedById: actorId },
          { transferId: { not: null } },
          { lifecycleEventId: { not: null } },
          { toolId: { not: null } },
        ],
      },
      select: { id: true, storageKey: true, thumbKey: true },
    });
    const entries = await Promise.all(
      photos.map(async (p) => {
        const key = variant === "thumb" && p.thumbKey ? p.thumbKey : p.storageKey;
        return [p.id, await this.storage.signedUrl(key, this.cfg.urlTtlSec)] as const;
      }),
    );
    return { expiresIn: this.cfg.urlTtlSec, urls: Object.fromEntries(entries) };
  }

  /** El autor puede descartar una foto mientras no esté asociada (p. ej. la quitó del formulario). */
  async discard(id: string, ctx: Ctx) {
    const photo = await this.prisma.photo.findUnique({ where: { id } });
    if (!photo || photo.uploadedById !== ctx.actorId) throw AppError.notFound("Foto");
    if (photo.transferId || photo.lifecycleEventId || photo.toolId) {
      throw AppError.conflict("PHOTO_ATTACHED", "La foto ya es evidencia de un movimiento y no se puede borrar");
    }
    const { count } = await this.prisma.photo.deleteMany({
      where: { id, transferId: null, lifecycleEventId: null, toolId: null },
    });
    if (count === 1) await this.storage.remove([photo.storageKey, ...(photo.thumbKey ? [photo.thumbKey] : [])]);
  }

  /** Borra fotos subidas que nunca se asociaron a nada. Devuelve cuántas eliminó. */
  async purgeOrphans(): Promise<number> {
    const cutoff = new Date(Date.now() - this.cfg.orphanTtlHours * 3_600_000);
    const orphans = await this.prisma.photo.findMany({
      where: { transferId: null, lifecycleEventId: null, toolId: null, createdAt: { lt: cutoff } },
      select: { id: true, storageKey: true, thumbKey: true },
      take: 500,
    });
    if (orphans.length === 0) return 0;

    // Primero BD (con la misma condición, por si alguna se asoció mientras tanto), luego objetos.
    const ids = orphans.map((o) => o.id);
    await this.prisma.photo.deleteMany({ where: { id: { in: ids }, transferId: null, lifecycleEventId: null, toolId: null } });
    const stillExisting = new Set((await this.prisma.photo.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id));
    const removed = orphans.filter((o) => !stillExisting.has(o.id));
    await this.storage.remove(removed.flatMap((o) => [o.storageKey, ...(o.thumbKey ? [o.thumbKey] : [])]));
    return removed.length;
  }
}
