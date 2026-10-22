import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  damageReportCreateSchema,
  money,
  pinSchema,
  rentalCreateSchema,
  rentalReturnSchema,
  transferCreateSchema,
  transferPhotosSchema,
  userCreateSchema,
  usernameSchema,
} from "./schemas.js";

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

describe("pinSchema", () => {
  it.each(["4829", "0571", "9305"])("acepta %s", (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(true);
  });

  it.each(["1234", "4321", "0000", "7777", "6789", "1212", "2580", "123", "12345", "12a4", " 482"])("rechaza %s", (pin) => {
    expect(pinSchema.safeParse(pin).success).toBe(false);
  });
});

describe("usernameSchema", () => {
  it("normaliza a minúsculas y sin espacios", () => {
    expect(usernameSchema.parse("  Kevin.Z ")).toBe("kevin.z");
  });

  it.each(["ab", "kevin zelaya", "josé", "-kevin", "a".repeat(31)])("rechaza %s", (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
});

describe("userCreateSchema", () => {
  const user = { name: "Mario", username: "mario" };

  it("exige PIN a los roles de campo", () => {
    expect(userCreateSchema.safeParse({ ...user, role: "SUPERVISOR", password: "4829" }).success).toBe(true);
    const r = userCreateSchema.safeParse({ ...user, role: "SUPERVISOR", password: "Segura-12345" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["password"]);
  });

  it("exige contraseña completa al administrador", () => {
    expect(userCreateSchema.safeParse({ ...user, role: "ADMIN", password: "4829" }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...user, role: "ADMIN", password: "Segura-12345" }).success).toBe(true);
  });
});

describe("damageReportCreateSchema", () => {
  const report = (photoIds: string[]) => ({
    id: randomUUID(),
    toolId: randomUUID(),
    occurredAt: new Date().toISOString(),
    kind: "GOLPE",
    condition: "CON_DETALLES",
    description: "Carcasa rajada",
    photoIds,
  });

  it("acepta de 0 a 3 fotos", () => {
    expect(damageReportCreateSchema.safeParse(report([])).success).toBe(true);
    expect(damageReportCreateSchema.safeParse(report([randomUUID(), randomUUID(), randomUUID()])).success).toBe(true);
  });

  it("rechaza una cuarta foto", () => {
    const r = damageReportCreateSchema.safeParse(report([randomUUID(), randomUUID(), randomUUID(), randomUUID()]));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["photoIds"]);
  });

  it("rechaza fotos repetidas y exige descripción", () => {
    const dup = randomUUID();
    expect(damageReportCreateSchema.safeParse(report([dup, dup])).success).toBe(false);
    expect(damageReportCreateSchema.safeParse({ ...report([]), description: "  " }).success).toBe(false);
  });

  it("exige el id generado por la app (evita duplicados al reintentar)", () => {
    const { id: _id, ...rest } = report([]);
    expect(damageReportCreateSchema.safeParse(rest).success).toBe(false);
  });
});

describe("rentalCreateSchema", () => {
  const rental = (extra: object) => ({
    id: randomUUID(),
    lessor: "Rentas del Norte",
    receivedAt: new Date().toISOString(),
    locationId: randomUUID(),
    receptionCondition: "BUENO",
    ...extra,
  });
  const newTool = { code: "REN-001", categoryId: randomUUID(), brand: "Bosch" };

  it("acepta una herramienta nueva o una existente, pero no ambas ni ninguna", () => {
    expect(rentalCreateSchema.safeParse(rental({ tool: newTool })).success).toBe(true);
    expect(rentalCreateSchema.safeParse(rental({ toolId: randomUUID() })).success).toBe(true);
    expect(rentalCreateSchema.safeParse(rental({})).success).toBe(false);
    expect(rentalCreateSchema.safeParse(rental({ tool: newTool, toolId: randomUUID() })).success).toBe(false);
  });

  it("la devolución prevista puede ser futura, pero no anterior a la recepción", () => {
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 7 * 86_400_000).toISOString();
    expect(rentalCreateSchema.safeParse(rental({ tool: newTool, expectedReturnAt: future })).success).toBe(true);
    expect(rentalCreateSchema.safeParse(rental({ tool: newTool, expectedReturnAt: past })).success).toBe(false);
  });

  it("limita las fotos de recepción", () => {
    const ids = Array.from({ length: 11 }, () => randomUUID());
    expect(rentalCreateSchema.safeParse(rental({ tool: newTool, photoIds: ids })).success).toBe(false);
  });
});

describe("rentalReturnSchema", () => {
  it("no admite fecha futura", () => {
    const r = rentalReturnSchema.safeParse({
      returnedAt: new Date(Date.now() + 3_600_000).toISOString(),
      returnCondition: "BUENO",
    });
    expect(r.success).toBe(false);
  });
});

describe("transferPhotosSchema", () => {
  it("no acepta la etapa de devolución de alquileres", () => {
    expect(transferPhotosSchema.safeParse({ photoIds: [randomUUID()], stage: "DEVOLUCION" }).success).toBe(false);
  });
});
