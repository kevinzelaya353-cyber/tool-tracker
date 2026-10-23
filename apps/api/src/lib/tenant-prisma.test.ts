import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { runAsPlatform, runWithContext } from "./context.js";
import { scopeArgs, tenantScoped } from "./tenant-prisma.js";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("scopeArgs: filtro por organización", () => {
  it("agrega la organización a las lecturas y escrituras con where", () => {
    for (const op of ["findMany", "findUnique", "findFirst", "count", "update", "updateMany", "delete", "deleteMany", "groupBy"]) {
      expect(scopeArgs(op, { where: { id: "x" } }, ORG)).toMatchObject({ where: { id: "x", organizationId: ORG } });
    }
    expect(scopeArgs("findMany", undefined, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it("no deja salir de la organización por el where", () => {
    expect(scopeArgs("findMany", { where: { organizationId: OTHER } }, ORG)).toEqual({ where: { organizationId: ORG } });
  });

  it("las altas nacen en la organización del contexto; otra organización se rechaza", () => {
    expect(scopeArgs("create", { data: { name: "x" } }, ORG)).toEqual({ data: { name: "x", organizationId: ORG } });
    expect(scopeArgs("createMany", { data: [{ a: 1 }, { a: 2 }] }, ORG)).toEqual({
      data: [
        { a: 1, organizationId: ORG },
        { a: 2, organizationId: ORG },
      ],
    });
    expect(() => scopeArgs("create", { data: { organizationId: OTHER } }, ORG)).toThrow(/no pertenece/);
    expect(() => scopeArgs("create", { data: { organization: { connect: { id: OTHER } } } }, ORG)).toThrow(/no pertenece/);
  });

  it("un registro no cambia de organización", () => {
    expect(() => scopeArgs("update", { where: { id: "x" }, data: { organizationId: OTHER } }, ORG)).toThrow(/no pertenece/);
    expect(() => scopeArgs("upsert", { where: { id: "x" }, create: {}, update: { organizationId: ORG } }, ORG)).toThrow(/no pertenece/);
    expect(scopeArgs("upsert", { where: { id: "x" }, create: { n: 1 }, update: { n: 2 } }, ORG)).toEqual({
      where: { id: "x", organizationId: ORG },
      create: { n: 1, organizationId: ORG },
      update: { n: 2 },
    });
  });
});

describe("tenantScoped: falla cerrado", () => {
  // Cliente falso: solo registra la consulta que le llega (la extensión es lo que se prueba).
  function fakeClient() {
    const seen: unknown[] = [];
    const client = {
      $extends(ext: { query: { $allModels: { $allOperations: (p: unknown) => unknown } } }) {
        const run = (model: string, operation: string, args: unknown) =>
          ext.query.$allModels.$allOperations({ model, operation, args, query: async (a: unknown) => (seen.push(a), a) });
        return { run };
      },
    };
    return { client: client as unknown as PrismaClient, seen };
  }

  it("sin contexto de petición, consultar un modelo de organización es un error", async () => {
    const { client } = fakeClient();
    const db = tenantScoped(client) as unknown as { run(m: string, o: string, a: unknown): Promise<unknown> };
    expect(() => db.run("Tool", "findMany", {})).toThrow(/sin contexto/);
    // Los modelos que no son de una organización pasan sin filtro.
    await expect(db.run("Organization", "findMany", {})).resolves.toEqual({});
  });

  it("con contexto filtra; el SuperAdmin sin organización elegida recibe ORG_REQUIRED; plataforma no filtra", async () => {
    const { client, seen } = fakeClient();
    const db = tenantScoped(client) as unknown as { run(m: string, o: string, a: unknown): Promise<unknown> };
    await runWithContext({ orgId: ORG, platform: false }, () => db.run("Tool", "findMany", { where: { status: "BODEGA" } }));
    expect(seen.at(-1)).toEqual({ where: { status: "BODEGA", organizationId: ORG } });

    expect(() => runWithContext({ orgId: null, platform: false }, () => db.run("Tool", "findMany", {}))).toThrow(
      expect.objectContaining({ code: "ORG_REQUIRED" }),
    );

    await runAsPlatform(() => db.run("Tool", "count", { where: {} }));
    expect(seen.at(-1)).toEqual({ where: {} });
  });
});
