export interface LatLng {
  lat: number;
  lng: number;
}

export interface MapMarker extends LatLng {
  label: string;
  color: string;
}

export interface LeafletOptions {
  markers?: MapMarker[];
  /** Ruta [[lat, lng], …]. Sin ruta y con dos marcadores se dibuja una línea recta punteada. */
  route?: [number, number][] | null;
  /** Modo selección: tocar el mapa coloca el punto y lo envía con { type: "pick", lat, lng }. */
  pick?: { initial?: LatLng | null; color: string };
  routeColor?: string;
}

/** Centro de Honduras, para cuando aún no hay puntos. */
const DEFAULT_CENTER: [number, number] = [14.65, -86.8];

// Versión fija con SRI: el HTML corre en un WebView/iframe y no debe cargar código que cambie.
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist";
const CSS_SRI = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
const JS_SRI = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";

/**
 * Página autónoma con Leaflet + teselas de OpenStreetMap. Los datos se insertan como JSON
 * (escapando "<" para que un nombre no pueda cerrar la etiqueta <script>).
 */
export function leafletHtml(opts: LeafletOptions): string {
  const data = JSON.stringify({
    markers: opts.markers ?? [],
    route: opts.route ?? null,
    pick: opts.pick ?? null,
    routeColor: opts.routeColor ?? "#2563EB",
    center: DEFAULT_CENTER,
  }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css" integrity="${CSS_SRI}" crossorigin="">
<script src="${LEAFLET}/leaflet.js" integrity="${JS_SRI}" crossorigin=""></script>
<style>
  html, body, #map { height: 100%; margin: 0; }
  .lbl { font: 600 12px system-ui, sans-serif; }
</style>
</head><body>
<div id="map"></div>
<script>
(function () {
  var d = ${data};
  var send = function (msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage(s, "*");
  };
  var map = L.map("map", { zoomControl: true, attributionControl: true }).setView(d.center, 7);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  var bounds = [];
  d.markers.forEach(function (m) {
    L.circleMarker([m.lat, m.lng], { radius: 9, color: "#fff", weight: 3, fillColor: m.color, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(m.label, { permanent: true, direction: "top", offset: [0, -8], className: "lbl" });
    bounds.push([m.lat, m.lng]);
  });

  if (d.route && d.route.length > 1) {
    L.polyline(d.route, { color: "#fff", weight: 9, opacity: 0.9 }).addTo(map);
    L.polyline(d.route, { color: d.routeColor, weight: 5 }).addTo(map);
    bounds = bounds.concat(d.route);
  } else if (d.markers.length === 2) {
    L.polyline(d.markers.map(function (m) { return [m.lat, m.lng]; }), { color: d.routeColor, weight: 4, dashArray: "8 8" }).addTo(map);
  }

  if (d.pick) {
    var pin = null;
    var place = function (lat, lng) {
      if (pin) pin.setLatLng([lat, lng]);
      else pin = L.circleMarker([lat, lng], { radius: 10, color: "#fff", weight: 3, fillColor: d.pick.color, fillOpacity: 1 }).addTo(map);
    };
    if (d.pick.initial) {
      place(d.pick.initial.lat, d.pick.initial.lng);
      map.setView([d.pick.initial.lat, d.pick.initial.lng], 15);
    }
    map.on("click", function (e) {
      place(e.latlng.lat, e.latlng.lng);
      send({ type: "pick", lat: e.latlng.lat, lng: e.latlng.lng });
    });
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [36, 36] });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 14);
  }
})();
</script>
</body></html>`;
}
