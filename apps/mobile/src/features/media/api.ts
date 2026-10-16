import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { UploadedPhoto } from "@/types/api";

export interface LocalImage {
  uri: string;
  width: number;
  height: number;
}

/** Sube hasta 5 imágenes ya comprimidas (límite por petición de la API). */
export function uploadPhotos(images: LocalImage[]) {
  const form = new FormData();
  images.forEach((img, i) => {
    // Formato de archivo de React Native para FormData.
    form.append("photos", { uri: img.uri, name: `foto-${i}.jpg`, type: "image/jpeg" } as unknown as Blob);
  });
  return api.upload<UploadedPhoto[]>("/api/media", form);
}

export const discardPhoto = (id: string) => api.del(`/api/media/${id}`);

/** URLs firmadas (expiran a los 10 min; se refrescan antes). */
export const usePhotoUrls = (ids: string[], variant: "thumb" | "full" = "thumb") =>
  useQuery({
    queryKey: ["photo-urls", variant, [...ids].sort()],
    enabled: ids.length > 0,
    staleTime: 8 * 60_000,
    queryFn: () =>
      api.post<{ expiresIn: number; urls: Record<string, string> }>("/api/media/urls", { ids, variant }).then((r) => r.urls),
  });
