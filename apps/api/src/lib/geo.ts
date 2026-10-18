/** Distancia en metros entre dos puntos (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
}

export type Point = { latitude: number | null; longitude: number | null };
export type GeoPhoto = { stage: string | null; latitude: number | null; longitude: number | null };

/**
 * A qué distancia del origen se tomaron las fotos de entrega y del destino las de recepción
 * (la más cercana de cada grupo). null si faltan coordenadas de la ubicación o de las fotos.
 */
export function photoDistances(photos: GeoPhoto[], from: Point, to: Point) {
  const nearest = (stage: "ENTREGA" | "RECEPCION", loc: Point) => {
    if (loc.latitude == null || loc.longitude == null) return null;
    const ds = photos
      .filter((p) => (stage === "RECEPCION" ? p.stage === "RECEPCION" : p.stage !== "RECEPCION"))
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => distanceM({ lat: p.latitude!, lng: p.longitude! }, { lat: loc.latitude!, lng: loc.longitude! }));
    return ds.length ? Math.min(...ds) : null;
  };
  return { deliveryM: nearest("ENTREGA", from), receptionM: nearest("RECEPCION", to) };
}
