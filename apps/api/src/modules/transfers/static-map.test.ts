import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { fitZoom, project, renderStaticMap } from "./static-map.js";

const TEGUS = { lat: 14.0723, lng: -87.1921 };
const COMAYAGUA = { lat: 14.4597, lng: -87.6374 };

/** Tesela gris lisa: suficiente para probar el armado sin red. */
const grayTile = async () =>
  sharp({ create: { width: 256, height: 256, channels: 3, background: "#CCCCCC" } }).png().toBuffer();

describe("static-map", () => {
  it("proyecta en Web Mercator (0,0 al centro del mundo)", () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lng: 180 }, 1).x).toBe(512);
  });

  it("elige más zoom para puntos cercanos que para lejanos", () => {
    const near = fitZoom([TEGUS, { lat: 14.08, lng: -87.18 }], 480, 320);
    const far = fitZoom([TEGUS, COMAYAGUA], 480, 320);
    expect(near).toBeGreaterThan(far);
    expect(far).toBe(9);
  });

  it("genera un JPEG del tamaño pedido usando solo las teselas necesarias", async () => {
    const fetchTile = vi.fn(grayTile);
    const img = await renderStaticMap(
      { from: TEGUS, to: COMAYAGUA, route: [[TEGUS.lat, TEGUS.lng], [14.3, -87.4], [COMAYAGUA.lat, COMAYAGUA.lng]] },
      fetchTile,
    );
    const meta = await sharp(img).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 480, height: 320 });
    expect(fetchTile.mock.calls.length).toBeGreaterThan(0);
    expect(fetchTile.mock.calls.length).toBeLessThanOrEqual(9);
    for (const [z] of fetchTile.mock.calls) expect(z).toBe(9);
  });

  it("si falla una tesela, falla la generación (no se guarda un mapa a medias)", async () => {
    await expect(renderStaticMap({ from: TEGUS, to: COMAYAGUA }, () => Promise.reject(new Error("sin red")))).rejects.toThrow();
  });
});
