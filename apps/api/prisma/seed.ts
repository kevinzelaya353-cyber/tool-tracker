import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { DEFAULT_CATEGORIES, passwordSchema, usernameSchema } from "@tt/shared";

const prisma = new PrismaClient();

/**
 * Datos iniciales de UNA organización (desarrollo o primer arranque): la organización, su
 * administrador, la "Bodega principal" y las categorías comunes. No borra ni renombra: se puede
 * volver a ejecutar. El SuperAdmin se crea aparte con `pnpm superadmin create` (prisma/superadmin.ts).
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en apps/api/.env antes de ejecutar el seed");
  }
  passwordSchema.parse(password);
  const username = usernameSchema.parse(process.env.SEED_ADMIN_USERNAME ?? "admin");
  const orgName = process.env.SEED_ORG_NAME ?? "Ingenieria H";
  const slug = process.env.SEED_ORG_SLUG ?? "ingenieria-h";

  // La organización por su identificador (la migración 3 crea "ingenieria-h" si ya había datos).
  const org = await prisma.organization.upsert({ where: { slug }, update: {}, create: { name: orgName, slug } });

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing && existing.organizationId !== org.id) {
    throw new Error(`El correo ${email} ya pertenece a otra organización o a un SuperAdmin`);
  }
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    // Un admin creado antes del usuario corto lo recibe aquí; no se toca su contraseña.
    update: existing?.username ? {} : { username },
    create: {
      organizationId: org.id,
      name: "Administrador",
      username,
      email: email.toLowerCase(),
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      passwordChangedAt: new Date(),
      role: "ADMIN",
    },
  });

  await prisma.location.upsert({
    where: { organizationId_name_type: { organizationId: org.id, name: "Bodega principal", type: "BODEGA" } },
    update: {},
    create: { organizationId: org.id, name: "Bodega principal", type: "BODEGA" },
  });

  for (const name of DEFAULT_CATEGORIES) {
    await prisma.toolCategory.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: {},
      create: { organizationId: org.id, name },
    });
  }

  console.log(
    `Seed listo: ${org.name} (${org.slug}), admin ${existing?.username ?? username} (${email}), Bodega principal, ${DEFAULT_CATEGORIES.length} categorías`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
