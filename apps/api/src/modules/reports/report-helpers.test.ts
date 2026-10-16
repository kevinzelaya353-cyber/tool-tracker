import { describe, expect, it } from "vitest";
import { reportRangeQuerySchema } from "@tt/shared";
import { defaultSeriesRange, fillByStatus, isValidTimeZone } from "./report-helpers.js";

describe("report helpers", () => {
  it("fillByStatus incluye todos los estados con cero", () => {
    const r = fillByStatus([{ status: "BODEGA", count: 3, value: "450.00" }]);
    expect(r.BODEGA).toEqual({ count: 3, value: "450.00" });
    expect(r.EXTRAVIADA).toEqual({ count: 0, value: "0.00" });
    expect(Object.keys(r)).toHaveLength(6);
  });

  it("defaultSeriesRange cubre 12 meses calendario incluyendo el actual", () => {
    const { from, to } = defaultSeriesRange(new Date("2026-10-15T12:00:00Z"));
    expect(from.toISOString()).toBe("2025-11-01T00:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-15T12:00:00.000Z");
  });

  it("valida zonas horarias IANA", () => {
    expect(isValidTimeZone("America/Tegucigalpa")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
  });

  it("rechaza rangos mayores a 10 años o invertidos", () => {
    expect(reportRangeQuerySchema.safeParse({ from: "2000-01-01", to: "2026-01-01" }).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2026-05-01", to: "2026-01-01" }).success).toBe(false);
    expect(reportRangeQuerySchema.safeParse({ from: "2025-01-01", to: "2026-01-01", granularity: "year" }).success).toBe(true);
  });
});
