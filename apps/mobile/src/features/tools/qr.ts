import { create } from "qrcode";

/** Margen blanco alrededor del código (en módulos): los lectores lo necesitan para ubicarlo. */
const QUIET = 2;

/**
 * Matriz del QR como un solo trazo SVG (un rectángulo por cada tramo horizontal de módulos negros).
 * El QR contiene solo el código de la herramienta: es lo que busca el escáner de la app.
 */
export function qrPath(text: string): { size: number; d: string } {
  const { modules } = create(text, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!modules.get(y, x)) continue;
      let run = 1;
      while (x + run < n && modules.get(y, x + run)) run++;
      d += `M${x + QUIET} ${y + QUIET}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  return { size: n + QUIET * 2, d };
}

export function qrSvg(text: string): string {
  const { size, d } = qrPath(text);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

export interface QrLabel {
  code: string;
  /** Tipo, marca y modelo: ayuda a pegar cada etiqueta en la herramienta correcta. */
  title: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Hoja de etiquetas para recortar: una cuadrícula con el QR, el código y la descripción. */
export function labelsHtml(labels: QrLabel[]): string {
  const cells = labels
    .map(
      (l) => `<div class="label">${qrSvg(l.code)}<div class="txt"><div class="code">${escapeHtml(l.code)}</div><div class="title">${escapeHtml(l.title)}</div></div></div>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas QR</title><style>
@page { margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.grid { display: flex; flex-wrap: wrap; gap: 4mm; }
.label { width: 62mm; height: 30mm; border: 0.3mm dashed #999; border-radius: 2mm; padding: 2mm; display: flex; align-items: center; gap: 2mm; page-break-inside: avoid; break-inside: avoid; }
.label svg { width: 26mm; height: 26mm; flex: none; }
.txt { min-width: 0; }
.code { font-size: 15pt; font-weight: 800; letter-spacing: 0.3pt; word-break: break-all; }
.title { font-size: 8.5pt; margin-top: 1mm; line-height: 1.2; max-height: 3.6em; overflow: hidden; }
</style></head><body><div class="grid">${cells}</div></body></html>`;
}
