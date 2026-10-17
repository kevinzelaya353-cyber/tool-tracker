import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import type { UploadedPhoto } from "@/types/api";

export interface LocalImage {
  uri: string;
  width: number;
  height: number;
}

/** Sube hasta 5 imágenes ya comprimidas (límite por petición de la API). */
export async function uploadPhotos(images: LocalImage[]) {
  const form = new FormData();
  for (const [i, img] of images.entries()) {
    const name = `foto-${i}.jpg`;
    if (Platform.OS === "web") {
      // En el navegador la uri es blob:/data:; FormData necesita el archivo real.
      const blob = await (await fetch(img.uri)).blob();
      form.append("photos", new File([blob], name, { type: blob.type || "image/jpeg" }));
    } else {
      // Formato de archivo de React Native para FormData.
      form.append("photos", { uri: img.uri, name, type: "image/jpeg" } as unknown as Blob);
    }
  }
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
