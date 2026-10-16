import sharp from "sharp";
import { AppError } from "../../lib/errors.js";

export type ImageKind = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Detecta el tipo real por magic bytes. Nunca se confía en el nombre del archivo
 * ni en el Content-Type enviado por el cliente. SVG, GIF, TIFF, HEIC, etc. se rechazan.
 */
export function detectImageType(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

export interface ImageLimits {
  maxInputPixels: number; // protege contra "bombas" de descompresión
  fullMaxSide: number;
  thumbMaxSide: number;
}

export const IMAGE_LIMITS: ImageLimits = {
  maxInputPixels: 40_000_000, // ~ 8000 × 5000
  fullMaxSide: 2048,
  thumbMaxSide: 320,
};

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

const unsupported = () =>
  AppError.badRequest("UNSUPPORTED_IMAGE", "Formato no permitido: solo JPEG, PNG o WEBP");
const invalid = () => AppError.badRequest("INVALID_IMAGE", "Imagen corrupta o demasiado grande");

/**
 * Re-codifica la imagen a JPEG:
 * - aplica la orientación EXIF y luego descarta TODOS los metadatos (GPS, modelo de
 *   cámara, fecha…): sharp no copia metadatos a la salida salvo que se pida;
 * - limita la resolución para ahorrar almacenamiento y ancho de banda;
 * - genera una miniatura para listados.
 * Re-codificar también neutraliza payloads incrustados en el archivo original.
 */
export async function processImage(buf: Buffer, limits: ImageLimits = IMAGE_LIMITS): Promise<ProcessedImage> {
  const kind = detectImageType(buf);
  if (!kind) throw unsupported();

  const open = () => sharp(buf, { limitInputPixels: limits.maxInputPixels, failOn: "error" });

  let format: string | undefined;
  try {
    format = (await open().metadata()).format;
  } catch {
    throw invalid();
  }
  if (format !== kind) throw unsupported();

  try {
    const { data: full, info } = await open()
      .rotate()
      .resize({ width: limits.fullMaxSide, height: limits.fullMaxSide, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }) // PNG/WEBP con transparencia → fondo blanco
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    const thumb = await sharp(full)
      .resize({ width: limits.thumbMaxSide, height: limits.thumbMaxSide, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    return { full, thumb, width: info.width, height: info.height };
  } catch {
    throw invalid();
  }
}
