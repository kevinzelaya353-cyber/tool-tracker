import { describe, expect, it, vi } from "vitest";
import { routeProvider, simplify } from "./routing.js";

const A = { lat: 14.0723, lng: -87.1921 };
const B = { lat: 14.4597, lng: -87.6374 };

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("routeProvider", () => {
  it("OSRM: convierte [lng, lat] a [lat, lng] y redondea distancia y duración", async () => {
    const fetch = vi.fn((_url: string | URL | Request) =>
      json({ routes: [{ geometry: { coordinates: [[A.lng, A.lat], [B.lng, B.lat]] }, distance: 81234.6, duration: 5400.4 }] }),
    );
    const route = await routeProvider({ osrmUrl: "https://osrm.test/", fetch })(A, B);
    expect(fetch.mock.calls[0]![0]).toBe(
      `https://osrm.test/route/v1/driving/${A.lng},${A.lat};${B.lng},${B.lat}?overview=full&geometries=geojson`,
    );
    expect(route).toEqual({ geometry: [[A.lat, A.lng], [B.lat, B.lng]], distanceM: 81235, durationS: 5400 });
  });

  it("con clave usa OpenRouteService", async () => {
    const fetch = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      json({
        features: [{ geometry: { coordinates: [[A.lng, A.lat], [B.lng, B.lat]] }, properties: { summary: { distance: 1000, duration: 60 } } }],
      }),
    );
    const route = await routeProvider({ orsApiKey: "clave", osrmUrl: "https://osrm.test", fetch })(A, B);
    expect(String(fetch.mock.calls[0]![0])).toContain("openrouteservice.org");
    expect(fetch.mock.calls[0]![1]?.headers).toMatchObject({ Authorization: "clave" });
    expect(route?.distanceM).toBe(1000);
  });

  it("devuelve null si el servicio falla o no hay proveedor", async () => {
    const failing = routeProvider({ osrmUrl: "https://osrm.test", fetch: vi.fn(() => json({}, 500)) });
    expect(await failing(A, B)).toBeNull();
    expect(await routeProvider({ osrmUrl: "" })(A, B)).toBeNull();
  });
});

describe("simplify", () => {
  it("acota los puntos conservando inicio y fin", () => {
    const coords = Array.from({ length: 5000 }, (_, i) => [i / 1e4, -i / 1e4] as [number, number]);
    const out = simplify(coords);
    expect(out.length).toBeLessThanOrEqual(1501);
    expect(out[0]).toEqual([0, -0]);
    expect(out.at(-1)).toEqual([0.4999, -0.4999]);
  });
});
