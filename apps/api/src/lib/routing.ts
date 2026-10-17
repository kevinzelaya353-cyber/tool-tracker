/** Punto WGS84. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Route {
  /** [[lat, lng], …] listo para dibujar en el mapa. */
  geometry: [number, number][];
  distanceM: number;
  durationS: number;
}

/** Calcula la ruta por carretera; null si no hay servicio o falla (el traslado se registra igual). */
export type RouteProvider = (from: LatLng, to: LatLng) => Promise<Route | null>;

export interface RoutingConfig {
  /** Clave de OpenRouteService. Si falta se usa OSRM. */
  orsApiKey?: string;
  /** Servidor OSRM (el público es solo para pruebas; vacío = sin rutas). */
  osrmUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

const MAX_POINTS = 1500; // suficiente para dibujar; acota el JSON guardado por traslado

/** Reduce puntos conservando inicio y fin, y redondea a ~1 m. */
export function simplify(coords: [number, number][]): [number, number][] {
  const step = Math.ceil(coords.length / MAX_POINTS);
  const kept = step > 1 ? coords.filter((_, i) => i % step === 0 || i === coords.length - 1) : coords;
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return kept.map(([lat, lng]) => [r(lat), r(lng)]);
}

/** GeoJSON usa [lng, lat]; el mapa espera [lat, lng]. */
const flip = (c: number[][]) => c.map(([lng, lat]) => [lat!, lng!] as [number, number]);

export function routeProvider(cfg: RoutingConfig): RouteProvider {
  const doFetch = cfg.fetch ?? fetch;
  const timeout = cfg.timeoutMs ?? 8000;

  const ors = async (from: LatLng, to: LatLng): Promise<Route> => {
    const res = await doFetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: cfg.orsApiKey!, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [[from.lng, from.lat], [to.lng, to.lat]] }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`ORS ${res.status}`);
    const body = (await res.json()) as {
      features: { geometry: { coordinates: number[][] }; properties: { summary: { distance?: number; duration?: number } } }[];
    };
    const f = body.features[0]!;
    return {
      geometry: simplify(flip(f.geometry.coordinates)),
      distanceM: Math.round(f.properties.summary.distance ?? 0),
      durationS: Math.round(f.properties.summary.duration ?? 0),
    };
  };

  const osrm = async (from: LatLng, to: LatLng): Promise<Route> => {
    const url = `${cfg.osrmUrl!.replace(/\/$/, "")}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await doFetch(url, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const body = (await res.json()) as { routes: { geometry: { coordinates: number[][] }; distance: number; duration: number }[] };
    const r = body.routes[0]!;
    return { geometry: simplify(flip(r.geometry.coordinates)), distanceM: Math.round(r.distance), durationS: Math.round(r.duration) };
  };

  const impl = cfg.orsApiKey ? ors : cfg.osrmUrl ? osrm : null;
  return async (from, to) => {
    if (!impl) return null;
    try {
      return await impl(from, to);
    } catch {
      return null; // sin red o sin ruta posible (p. ej. otra isla): el mapa muestra una línea recta
    }
  };
}
