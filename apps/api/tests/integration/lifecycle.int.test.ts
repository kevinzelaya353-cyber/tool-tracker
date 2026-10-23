import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { as, createTool, prisma, resetDb, seedBase, toolEvents, toolState, transferBody, type Base } from "./helpers.js";

const event = (base: Base, body: Record<string, unknown>, user = base.bodeguero) =>
  as(user).post("/api/lifecycle-events", body);

describe("ciclo de vida (integración)", () => {
  let base: Base;
  beforeEach(async () => {
    await resetDb();
    base = await seedBase();
  });
  afterAll(() => prisma.$disconnect());

  it("daño en obra → DANADA; luego no se puede trasladar", async () => {
    const t = await createTool(base);
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
    const dmg = await event(base, { toolId: t.id, type: "DAMAGE", occurredAt: "2025-02-03T10:00:00Z", description: "Carbones quemados" }, base.supervisor);
    expect(dmg.status).toBe(201);
    expect(await toolState(t.id)).toMatchObject({ status: "DANADA", currentLocationId: base.obraA.id });

    const move = await as(base.supervisor).post(
      "/api/transfers",
      transferBody(base, [t.id], { fromLocationId: base.obraA.id, toLocationId: base.bodega.id, movedAt: "2025-02-04T10:00:00Z" }),
    );
    expect(move.status).toBe(409);
  });

  it("ciclo de mantenimiento con costo: sale de obra, vuelve a bodega", async () => {
    const t = await createTool(base);
    await as(base.bodeguero).post("/api/transfers", transferBody(base, [t.id]));
    expect((await event(base, { toolId: t.id, type: "MAINTENANCE_START", occurredAt: "2025-02-02T00:00:00Z" })).status).toBe(201);
    expect((await toolState(t.id)).currentCustodianId).toBeNull();

    // Terminar mantenimiento hacia un proyecto no está permitido.
    const toProject = await event(base, { toolId: t.id, type: "MAINTENANCE_END", occurredAt: "2025-02-05T00:00:00Z", locationId: base.obraA.id });
    expect(toProject.status).toBe(409);
    // Sin destino tampoco.
    expect((await event(base, { toolId: t.id, type: "MAINTENANCE_END", occurredAt: "2025-02-05T00:00:00Z" })).status).toBe(400);

    const end = await event(base, {
      toolId: t.id,
      type: "MAINTENANCE_END",
      occurredAt: "2025-02-05T00:00:00Z",
      locationId: base.bodega.id,
      cost: "45.50",
    });
    expect(end.status).toBe(201);
    expect(await toolState(t.id)).toMatchObject({ status: "BODEGA", currentLocationId: base.bodega.id });
    expect(end.body.cost).toBe("45.5");
  });

  it("extravío y recuperación: solo hacia bodega; LOSS no admite costo", async () => {
    const t = await createTool(base);
    expect((await event(base, { toolId: t.id, type: "LOSS", occurredAt: "2025-02-01T00:00:00Z", cost: "10" })).body.error.code).toBe(
      "EVENT_REJECTED",
    );
    expect((await event(base, { toolId: t.id, type: "LOSS", occurredAt: "2025-02-01T00:00:00Z" })).status).toBe(201);
    expect((await event(base, { toolId: t.id, type: "LOSS", occurredAt: "2025-02-02T00:00:00Z" })).status).toBe(409); // ya extraviada

    const recover = await event(base, { toolId: t.id, type: "RECOVERY", occurredAt: "2025-03-01T00:00:00Z", locationId: base.bodega.id });
    expect(recover.status).toBe(201);
    expect((await toolState(t.id)).status).toBe("BODEGA");
  });

  it("dar de baja: solo ADMIN, solo desde dañada/extraviada, y es terminal", async () => {
    const t = await createTool(base);
    await event(base, { toolId: t.id, type: "DAMAGE", occurredAt: "2025-02-01T00:00:00Z" });
    expect((await event(base, { toolId: t.id, type: "DECOMMISSION", occurredAt: "2025-02-02T00:00:00Z" })).status).toBe(403);
    expect((await event(base, { toolId: t.id, type: "DECOMMISSION", occurredAt: "2025-02-02T00:00:00Z" }, base.admin)).status).toBe(201);

    const detail = await as(base.admin).get(`/api/tools/${t.id}`);
    expect(detail.body.status).toBe("DADA_DE_BAJA");
    expect(detail.body.availableEvents).toEqual([]);
    expect((await event(base, { toolId: t.id, type: "MAINTENANCE_START", occurredAt: "2025-02-03T00:00:00Z" }, base.admin)).status).toBe(409);
  });

  it("el historial es inmutable a nivel de base de datos", async () => {
    const t = await createTool(base);
    const [e] = await toolEvents(t.id);
    await expect(prisma.$executeRaw`UPDATE lifecycle_events SET cost = 0 WHERE id = ${e!.id}::uuid`).rejects.toThrow(/solo inserción/);
    await expect(prisma.$executeRaw`DELETE FROM lifecycle_events WHERE id = ${e!.id}::uuid`).rejects.toThrow(/solo inserción/);
  });

  it("las restricciones CHECK de la BD respaldan las reglas aunque se salte la API", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO transfers (id, organization_id, from_location_id, to_location_id, delivered_by, received_by, moved_at, created_by)
        VALUES (gen_random_uuid(), ${base.org.id}::uuid, ${base.bodega.id}::uuid, ${base.bodega.id}::uuid, ${base.admin.id}::uuid, ${base.lector.id}::uuid, now(), ${base.admin.id}::uuid)`,
    ).rejects.toThrow(/transfers_distinct_locations/);
  });

  it("CONCURRENCIA: daño y traslado simultáneos dejan una cadena de estados coherente", async () => {
    for (let round = 0; round < 5; round++) {
      const t = await createTool(base);
      await Promise.all([
        event(base, { toolId: t.id, type: "DAMAGE", occurredAt: "2025-02-01T09:00:00Z" }),
        as(base.supervisor).post("/api/transfers", transferBody(base, [t.id], { movedAt: "2025-02-01T09:00:00Z" })),
      ]);

      // Invariante: cada evento parte del estado en que dejó la herramienta el anterior,
      // y el estado actual coincide con el último evento.
      const events = await toolEvents(t.id);
      for (let i = 1; i < events.length; i++) expect(events[i]!.fromStatus).toBe(events[i - 1]!.toStatus);
      expect((await toolState(t.id)).status).toBe(events.at(-1)!.toStatus);
    }
  });
});
