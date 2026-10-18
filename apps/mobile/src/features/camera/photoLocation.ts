import * as Location from "expo-location";

export interface PhotoSpot {
  lat: number;
  lng: number;
  /** Precisión en metros según el GPS. */
  acc?: number;
}

const TIMEOUT_MS = 8000;

/**
 * Dónde está el teléfono al tomar las fotos, para comprobar después que la entrega o la recepción
 * se hizo en el lugar. Nunca bloquea la subida: sin permiso, sin señal de GPS o si tarda, devuelve null.
 */
export async function currentSpot(): Promise<PhotoSpot | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    let granted = perm.granted;
    if (!granted && perm.canAskAgain) granted = (await Location.requestForegroundPermissionsAsync()).granted;
    if (!granted) return null;

    // Una posición reciente basta (se tomó hace un momento en el mismo lugar) y es instantánea.
    const recent = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60_000, requiredAccuracy: 200 }).catch(() => null);
    const pos =
      recent ??
      (await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
      ]));
    if (!pos) return null;
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      acc: pos.coords.accuracy == null ? undefined : Math.round(pos.coords.accuracy),
    };
  } catch {
    return null;
  }
}
