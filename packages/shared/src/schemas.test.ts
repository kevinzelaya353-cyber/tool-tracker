import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { money, transferCreateSchema } from "./schemas.js";

const base = () => ({
  fromLocationId: randomUUID(),
  toLocationId: randomUUID(),
  deliveredById: randomUUID(),
  receivedById: randomUUID(),
  movedAt: new Date().toISOString(),
  items: [{ toolId: randomUUID() }],
});

describe("transferCreateSchema", () => {
  it("acepta un traslado válido", () => {
    expect(transferCreateSchema.safeParse(base()).success).toBe(true);
  });

  it("rechaza origen = destino", () => {
    const t = base();
    t.toLocationId = t.fromLocationId;
    expect(transferCreateSchema.safeParse(t).success).toBe(false);
  });

  it("rechaza entrega y recepción por la misma persona", () => {
    const t = base();
    t.receivedById = t.deliveredById;
    expect(transferCreateSchema.safeParse(t).success).toBe(false);
  });

  it("rechaza herramientas duplicadas", () => {
    const t = base();
    t.items.push({ toolId: t.items[0]!.toolId });
    expect(transferCreateSchema.safeParse(t).success).toBe(false);
  });

  it("rechaza fecha futura", () => {
    const t = base();
    t.movedAt = new Date(Date.now() + 86_400_000).toISOString();
    expect(transferCreateSchema.safeParse(t).success).toBe(false);
  });
});

describe("money", () => {
  it.each(["0", "1500", "1499.99"])("acepta %s", (v) => expect(money.safeParse(v).success).toBe(true));
  it.each(["-1", "1.999", "abc", "1e5"])("rechaza %s", (v) => expect(money.safeParse(v).success).toBe(false));
});
