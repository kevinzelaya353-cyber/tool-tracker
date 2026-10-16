import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { passwordSchema } from "@tt/shared";

const prisma = new PrismaClient();

const CATEGORIES = [
  "Taladro",
  "Rotomartillo",
  "Pulidora",
  "Demoledor",
  "Sierra circular",
  "Extensión eléctrica",
  "Nivel láser",
  "Compresor",
  "Soldadora",
  "Otro",
];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en apps/api/.env antes de ejecutar el seed");
  }
  passwordSchema.parse(password);

  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      name: "Administrador",
      email: email.toLowerCase(),
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      role: "ADMIN",
    },
  });

  await prisma.location.upsert({
    where: { name_type: { name: "Bodega principal", type: "BODEGA" } },
    update: {},
    create: { name: "Bodega principal", type: "BODEGA" },
  });

  for (const name of CATEGORIES) {
    await prisma.toolCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log(`Seed listo: admin ${email}, Bodega principal, ${CATEGORIES.length} categorías`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
