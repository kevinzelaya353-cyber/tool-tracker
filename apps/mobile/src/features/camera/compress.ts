import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { LocalImage } from "../media/api";

const MAX_SIDE = 2048; // igual que el servidor: no tiene sentido subir más resolución

/**
 * Reduce y re-codifica a JPEG en el teléfono antes de subir: menos datos móviles en obra,
 * convierte HEIC (iPhone) a JPEG y descarta los metadatos EXIF en origen.
 */
export async function compressImage(img: LocalImage): Promise<LocalImage> {
  const ctx = ImageManipulator.manipulate(img.uri);
  const longest = Math.max(img.width, img.height);
  if (longest > MAX_SIDE) {
    ctx.resize(img.width >= img.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}
