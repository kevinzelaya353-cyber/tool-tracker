import { describe, expect, it } from "vitest";
import { redact } from "./audit.js";

describe("redact", () => {
  it("oculta campos sensibles a cualquier profundidad", () => {
    expect(
      redact({
        name: "Ana",
        password: "x",
        nested: { passwordHash: "h", refreshToken: "t", role: "ADMIN" },
        list: [{ apiSecret: "s", ok: 1 }],
      }),
    ).toEqual({
      name: "Ana",
      password: "[REDACTED]",
      nested: { passwordHash: "[REDACTED]", refreshToken: "[REDACTED]", role: "ADMIN" },
      list: [{ apiSecret: "[REDACTED]", ok: 1 }],
    });
  });

  it("serializa instancias con toJSON (Decimal, Date) en vez de desarmarlas", () => {
    class FakeDecimal {
      constructor(private v: string) {}
      toJSON() {
        return this.v;
      }
    }
    const at = new Date("2026-01-01T00:00:00Z");
    expect(redact({ price: { from: new FakeDecimal("100"), to: "120.50" }, at })).toEqual({
      price: { from: "100", to: "120.50" },
      at: "2026-01-01T00:00:00.000Z",
    });
  });
});
