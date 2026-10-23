import { Prisma, type PrismaClient } from "@prisma/client";
import { DEFAULT_CATEGORIES, type OrganizationCreateInput, type OrganizationUpdateInput } from "@tt/shared";
import { audit } from "../../lib/audit.js";
import { AppError } from "../../lib/errors.js";
import { hashPassword } from "../auth/auth.service.js";
import type { AccessClaims, TokenService } from "../auth/token.service.js";

/** Nombre → identificador corto: "Ingeniería H" → "ingenieria-h". */
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return s.length >= 2 ? s : `org-${s}`.replace(/-$/, "");
}

const ORG_FIELDS = {
  id: true,
  name: true,
  slug: true,
  active: true,
  legalName: true,
  taxId: true,
  contactEmail: true,
  contactPhone: true,
  address: true,
  currency: true,
  brandColor: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Organizaciones (solo SuperAdmin). Cliente sin filtro por organización: es administración de la plataforma.
 * Una organización no se borra: al desactivarla sus usuarios no pueden entrar y se cierran sus sesiones.
 */
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly tokens: Pick<TokenService, "revokeAllForUser">,
    private readonly onStatusChange: (orgId: string) => void = () => undefined,
  ) {}

  async list() {
    const [orgs, users, tools] = await Promise.all([
      this.prisma.organization.findMany({ select: ORG_FIELDS, orderBy: { name: "asc" } }),
      this.prisma.user.groupBy({
        by: ["organizationId"],
        where: { organizationId: { not: null }, OR: [{ username: { not: null } }, { email: { not: null } }] },
        _count: { _all: true },
      }),
      this.prisma.tool.groupBy({ by: ["organizationId"], where: { status: { notIn: ["DADA_DE_BAJA", "DEVUELTA"] } }, _count: { _all: true } }),
    ]);
    const u = new Map(users.map((g) => [g.organizationId, g._count._all]));
    const t = new Map(tools.map((g) => [g.organizationId, g._count._all]));
    return orgs.map((o) => ({ ...o, users: u.get(o.id) ?? 0, tools: t.get(o.id) ?? 0 }));
  }

  async get(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id }, select: ORG_FIELDS });
    if (!org) throw AppError.notFound("Organización");
    const [admins, users, tools] = await Promise.all([
      this.prisma.user.findMany({
        where: { organizationId: id, role: "ADMIN" },
        select: { id: true, name: true, username: true, active: true, lockedAt: true, lastLoginAt: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.user.count({ where: { organizationId: id, OR: [{ username: { not: null } }, { email: { not: null } }] } }),
      this.prisma.tool.count({ where: { organizationId: id } }),
    ]);
    return { ...org, admins, users, tools };
  }

  /** Nace con sus categorías comunes, una "Bodega principal" y, si se indica, su primer administrador. */
  async create(actor: AccessClaims, input: OrganizationCreateInput, ip?: string) {
    const slug = input.slug ?? (await this.freeSlug(slugify(input.name)));
    const adminHash = input.admin ? await hashPassword(input.admin.password) : undefined;
    const { admin, ...data } = input;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { ...data, slug }, select: ORG_FIELDS });
        await tx.toolCategory.createMany({ data: DEFAULT_CATEGORIES.map((name) => ({ name, organizationId: org.id })) });
        await tx.location.create({ data: { organizationId: org.id, name: "Bodega principal", type: "BODEGA" } });
        const firstAdmin = admin
          ? await tx.user.create({
              data: {
                organizationId: org.id,
                name: admin.name,
                username: admin.username,
                email: admin.email,
                role: "ADMIN",
                passwordHash: adminHash,
                passwordChangedAt: new Date(),
                // Quien la creó conoce la contraseña: el administrador la cambia al entrar.
                mustChangePassword: true,
              },
              select: { id: true, name: true, username: true },
            })
          : null;
        await audit(tx, {
          actorId: actor.userId,
          action: "organization.create",
          entity: "organization",
          entityId: org.id,
          organizationId: org.id,
          diff: { name: org.name, slug: org.slug, currency: org.currency, firstAdmin: firstAdmin?.username ?? null },
          ip,
        });
        return { ...org, admins: firstAdmin ? [firstAdmin] : [], users: firstAdmin ? 1 : 0, tools: 0 };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = String((err.meta as { target?: unknown } | undefined)?.target ?? "");
        throw AppError.conflict(
          "DUPLICATE",
          target.includes("slug") ? "Ya existe una organización con ese identificador" : "Ese usuario ya existe en la plataforma",
        );
      }
      throw err;
    }
  }

  async update(actor: AccessClaims, id: string, input: OrganizationUpdateInput, ip?: string) {
    const before = await this.prisma.organization.findUnique({ where: { id }, select: ORG_FIELDS });
    if (!before) throw AppError.notFound("Organización");
    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({ where: { id }, data: input, select: ORG_FIELDS });
      const diff: Record<string, unknown> = {};
      for (const k of Object.keys(input) as (keyof OrganizationUpdateInput)[]) {
        if (before[k] !== updated[k]) diff[k] = { from: before[k], to: updated[k] };
      }
      if (input.active === false && before.active) {
        // Las sesiones de soporte abiertas hacia esta organización también terminan.
        await tx.impersonationSession.updateMany({
          where: { organizationId: id, endedAt: null },
          data: { endedAt: new Date(), endReason: "REVOKED", endedById: actor.userId },
        });
      }
      await audit(tx, {
        actorId: actor.userId,
        action: input.active === false && before.active ? "organization.deactivate" : input.active && !before.active ? "organization.activate" : "organization.update",
        entity: "organization",
        entityId: id,
        organizationId: id,
        diff,
        ip,
      });
      return updated;
    });

    if (input.active !== undefined && input.active !== before.active) {
      this.onStatusChange(id);
      if (!input.active) {
        // Nadie de la organización puede renovar su sesión; los access tokens vigentes los frena la API.
        const users = await this.prisma.user.findMany({ where: { organizationId: id }, select: { id: true } });
        for (const u of users) await this.tokens.revokeAllForUser(u.id);
      }
    }
    return after;
  }

  private async freeSlug(base: string): Promise<string> {
    const taken = new Set(
      (await this.prisma.organization.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((o) => o.slug),
    );
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  }
}
