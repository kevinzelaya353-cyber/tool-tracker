/** Máximo "redondo" para el eje (1, 2, 2.5, 5 × 10^n) y sus marcas intermedias. */
export function niceScale(max: number, ticks = 3): { top: number; steps: number[] } {
  if (max <= 0) return { top: 1, steps: [0, 1] };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  const top = step * Math.ceil(max / step);
  const steps: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) steps.push(v);
  return { top, steps };
}

/** Etiqueta compacta para ejes: 1.2 M, 35 k, 800. */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)} M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)} k`;
  return String(Math.round(v));
}
