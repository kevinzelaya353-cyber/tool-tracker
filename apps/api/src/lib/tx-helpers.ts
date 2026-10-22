import type { Prisma } from "@prisma/client";
import type { PhotoStage, ToolStatus } from "@tt/shared";
import type { LockedTool } from "../domain/rules.js";
import { AppError } from "./errors.js";

type Tx = Prisma.TransactionClient;

/**
 * Bloquea (SELECT … FOR UPDATE) las herramientas indicadas hasta el fin de la
 * transacción, para que dos traslados simultáneos no muevan la misma herramienta.
 * Orden por id para evitar deadlocks entre transacciones concurrentes.
 */
export async function lockTools(tx: Tx, ids: string[]): Promise<LockedTool[]> {
  if (ids.length === 0) return [];
  const rows = await tx.$queryRaw<
    { id: string; code: string; status: ToolStatus; currentLocationId: string | null; purchaseDate: Date; lastEventAt: Date | null }[]
  >`
    SELECT t.id,
           t.code,
           t.status::text            AS "status",
           t.current_location_id     AS "currentLocationId",
           t.purchase_date           AS "purchaseDate",
           (SELECT max(e.occurred_at) FROM lifecycle_events e WHERE e.tool_id = t.id) AS "lastEventAt"
    FROM tools t
    WHERE t.id = ANY(${ids}::uuid[])
    ORDER BY t.id
    FOR UPDATE OF t
  `;
  return rows;
}

/** Una foto subida que todavía no es evidencia de nada (la purga borra las que quedan así). */
export const UNATTACHED_PHOTO = {
  transferId: null,
  lifecycleEventId: null,
  damageReportId: null,
  rentalId: null,
  toolId: null,
} satisfies Prisma.PhotoWhereInput;

/**
 * Asocia fotos ya subidas (/media) a un traslado, evento, reporte de daño, alquiler o herramienta.
 * Solo se aceptan fotos del mismo usuario que aún no estén asociadas a nada: así una foto ya
 * usada como evidencia (p. ej. de una recepción) nunca se reasigna ni se sobrescribe.
 */
export async function attachPhotos(
  tx: Tx,
  photoIds: string[],
  uploaderId: string,
  target:
    | { transferId: string; stage: PhotoStage; toolId?: never }
    | { lifecycleEventId: string; toolId: string }
    | { damageReportId: string; toolId: string }
    | { rentalId: string; toolId: string; stage: Extract<PhotoStage, "RECEPCION" | "DEVOLUCION"> }
    | { toolId: string; transferId?: never; lifecycleEventId?: never },
): Promise<void> {
  if (photoIds.length === 0) return;
  const { count } = await tx.photo.updateMany({
    where: { id: { in: photoIds }, uploadedById: uploaderId, ...UNATTACHED_PHOTO },
    data: target,
  });
  if (count !== new Set(photoIds).size) {
    throw AppError.conflict("PHOTO_UNAVAILABLE", "Alguna foto no existe, no es tuya o ya está asociada");
  }
}
