import sharp from "sharp";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StaticMapInput {
  from: LatLng;
  to: LatLng;
  /** [[lat, lng], …]; sin ruta se dibuja una línea recta punteada. */
  route?: [number, number][] | null;
  width?: number;
  height?: number;
}

/** Descarga una tesela de OpenStreetMap (z/x/y) como PNG. */
export type TileFetcher = (z: number, x: number, y: number) => Promise<Buffer>;

const TILE = 256;
const MAX_ZOOM = 16;
const PAD = 28; // margen para que los marcadores no queden en el borde

/** Web Mercator: coordenadas → píxeles globales en el zoom z. */
export function project(p: LatLng, z: number): { x: number; y: number } {
  const scale = TILE * 2 ** z;
  const sin = Math.sin((p.lat * Math.PI) / 180);
  return {
    x: ((p.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  };
}

/** Mayor zoom en el que todos los puntos caben en el lienzo (con margen). */
export function fitZoom(points: LatLng[], width: number, height: number): number {
  for (let z = MAX_ZOOM; z > 1; z--) {
    const px = points.map((p) => project(p, z));
    const w = Math.max(...px.map((p) => p.x)) - Math.min(...px.map((p) => p.x));
    const h = Math.max(...px.map((p) => p.y)) - Math.min(...px.map((p) => p.y));
    if (w <= width - 2 * PAD && h <= height - 2 * PAD) return z;
  }
  return 1;
}

/** Política de uso de OpenStreetMap: User-Agent identificable y resultados cacheados (aquí, una imagen por traslado). */
export function osmTileFetcher(userAgent: string, timeoutMs = 8000): TileFetcher {
  return async (z, x, y) => {
    const res = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Tesela ${z}/${x}/${y}: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
}

/**
 * Imagen JPEG del traslado: teselas de OSM, ruta en azul (con borde blanco),
 * origen en verde, destino en rojo y la atribución obligatoria de OpenStreetMap.
 */
export async function renderStaticMap(input: StaticMapInput, fetchTile: TileFetcher): Promise<Buffer> {
  const width = input.width ?? 480;
  const height = input.height ?? 320;
  const line: LatLng[] =
    input.route && input.route.length > 1 ? input.route.map(([lat, lng]) => ({ lat, lng })) : [input.from, input.to];
  const z = fitZoom([...line, input.from, input.to], width, height);

  // Centro del encuadre en píxeles globales y esquina superior izquierda del lienzo.
  const all = [...line, input.from, input.to].map((p) => project(p, z));
  const cx = (Math.min(...all.map((p) => p.x)) + Math.max(...all.map((p) => p.x))) / 2;
  const cy = (Math.min(...all.map((p) => p.y)) + Math.max(...all.map((p) => p.y))) / 2;
  const left = Math.round(cx - width / 2);
  const top = Math.round(cy - height / 2);

  // Teselas que cubren el lienzo: se pegan en una cuadrícula y luego se recorta la ventana.
  const tx0 = Math.floor(left / TILE);
  const ty0 = Math.floor(top / TILE);
  const tx1 = Math.floor((left + width - 1) / TILE);
  const ty1 = Math.floor((top + height - 1) / TILE);
  const max = 2 ** z;
  const jobs: Promise<sharp.OverlayOptions | null>[] = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      if (ty < 0 || ty >= max) continue;
      const wrapped = ((tx % max) + max) % max;
      jobs.push(
        fetchTile(z, wrapped, ty).then((input) => ({ input, left: (tx - tx0) * TILE, top: (ty - ty0) * TILE })),
      );
    }
  }
  const tiles = (await Promise.all(jobs)).filter((t): t is sharp.OverlayOptions => t !== null);
  const grid = await sharp({
    create: {
      width: (tx1 - tx0 + 1) * TILE,
      height: (ty1 - ty0 + 1) * TILE,
      channels: 3,
      background: "#E5E7EB",
    },
  })
    .composite(tiles)
    .png()
    .toBuffer();

  const toPx = (p: LatLng) => {
    const g = project(p, z);
    return `${(g.x - left).toFixed(1)},${(g.y - top).toFixed(1)}`;
  };
  const points = line.map(toPx).join(" ");
  const [fx, fy] = toPx(input.from).split(",");
  const [dx, dy] = toPx(input.to).split(",");
  const dashed = !(input.route && input.route.length > 1);

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <polyline points="${points}" fill="none" stroke="#FFFFFF" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <polyline points="${points}" fill="none" stroke="#2563EB" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"${dashed ? ' stroke-dasharray="10 8"' : ""}/>
  <circle cx="${fx}" cy="${fy}" r="9" fill="#16A34A" stroke="#FFFFFF" stroke-width="3"/>
  <circle cx="${dx}" cy="${dy}" r="9" fill="#DC2626" stroke="#FFFFFF" stroke-width="3"/>
  <rect x="${width - 112}" y="${height - 16}" width="112" height="16" fill="#FFFFFF" opacity="0.8"/>
  <text x="${width - 6}" y="${height - 4}" font-family="Arial, sans-serif" font-size="11" text-anchor="end" fill="#333">© OpenStreetMap</text>
</svg>`);

  return sharp(grid)
    .extract({ left: left - tx0 * TILE, top: top - ty0 * TILE, width, height })
    .composite([{ input: overlay, top: 0, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();
}
