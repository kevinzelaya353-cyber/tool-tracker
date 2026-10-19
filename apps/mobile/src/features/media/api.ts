import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { File as DeviceFile } from "expo-file-system";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import type { UploadedPhoto } from "@/types/api";
import type { PhotoSpot } from "../camera/photoLocation";

export interface LocalImage {
  uri: string;
  width: number;
  height: number;
}

/**
 * Sube hasta 5 imágenes ya comprimidas (límite por petición de la API). `spot`: dónde estaba el
 * teléfono al tomarlas; va antes que los archivos para que la API lo lea junto con ellos.
 */
export async function uploadPhotos(images: LocalImage[], spot?: PhotoSpot | null) {
  const form = new FormData();
  if (spot) {
    form.append("lat", String(spot.lat));
    form.append("lng", String(spot.lng));
    if (spot.acc != null) form.append("acc", String(spot.acc));
  }
  for (const [i, img] of images.entries()) {
    const name = `foto-${i}.jpg`;
    if (Platform.OS === "web") {
      // En el navegador la uri es blob:/data:; FormData necesita el archivo real.
      const blob = await (await fetch(img.uri)).blob();
      form.append("photos", new File([blob], name, { type: blob.type || "image/jpeg" }));
    } else {
      // El fetch global de Expo (expo/fetch) no admite partes { uri, name, type } de React Native;
      // un File de expo-file-system sí (lee los bytes). Nombre y tipo salen del archivo (.jpg).
      form.append("photos", new DeviceFile(img.uri) as unknown as Blob);
    }
  }
  return api.upload<UploadedPhoto[]>("/api/media", form);
}

export const discardPhoto = (id: string) => api.del(`/api/media/${id}`);

/**
 * Elimina una foto de la app. Si ya es evidencia de un traslado o evento, la API solo la
 * oculta: deja de verse aquí pero queda en el historial del Excel.
 */
export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: discardPhoto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tools"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
  });
}

/** URLs firmadas (expiran a los 10 min; se refrescan antes). */
export const usePhotoUrls = (ids: string[], variant: "thumb" | "full" = "thumb") =>
  useQuery({
    queryKey: ["photo-urls", variant, [...ids].sort()],
    enabled: ids.length > 0,
    staleTime: 8 * 60_000,
    queryFn: () =>
      api.post<{ expiresIn: number; urls: Record<string, string> }>("/api/media/urls", { ids, variant }).then((r) => r.urls),
  });
