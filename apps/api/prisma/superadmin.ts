import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { passwordSchema, usernameSchema } from "@tt/shared";

/**
 * Alta y recuperación de la cuenta SuperAdmin desde el servidor (requiere acceso a la máquina y a la BD).
 *
 *   SUPERADMIN_USERNAME=... SUPERADMIN_PASSWORD=... pnpm --filter @tt/api superadmin create
 *   SUPERADMIN_USERNAME=... SUPERADMIN_PASSWORD=... pnpm --filter @tt/api superadmin reset
 *
 * - create: crea la cuenta si no existe (opcional SUPERADMIN_NAME y SUPERADMIN_EMAIL).
 * - reset:  recuperación de acceso: nueva contraseña, desbloquea, reactiva y cierra sus sesiones.
 * La contraseña se lee del entorno (nunca de un argumento: quedaría en el historial del shell),
 * no se imprime y no se guarda en ningún archivo. Ambas acciones quedan en la auditoría.
 */
const prisma = new PrismaClient();

async function main() {
  const command = process.argv[2];
  if (command !== "create" && command !== "reset") throw new Error("Uso: superadmin <create|reset>");
  const username = usernameSchema.parse(process.env.SUPERADMIN_USERNAME ?? "");
  const password = passwordSchema.parse(process.env.SUPERADMIN_PASSWORD ?? "");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const existing = await prisma.user.findUnique({ where: { username } });

  if (command === "create") {
    if (existing) throw new Error(`El usuario ${username} ya existe (${existing.role}). Usa "reset" para recuperar el acceso.`);
    const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase() || null;
    const user = await prisma.user.create({
      data: {
        name: process.env.SUPERADMIN_NAME ?? "Administrador de la plataforma",
        username,
        email,
        role: "SUPERADMIN",
        organizationId: null,
        passwordHash,
        passwordChangedAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { action: "user.create_superadmin", entity: "user", entityId: user.id, diff: { via: "cli", username } },
    });
    console.log(`SuperAdmin ${username} creado.`);
    return;
  }

  if (!existing) throw new Error(`No existe el usuario ${username}`);
  if (existing.role !== "SUPERADMIN") throw new Error(`${username} no es SuperAdmin: su contraseña la restablece un administrador`);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedAt: null, active: true, mustChangePassword: false },
    }),
    prisma.refreshToken.updateMany({ where: { userId: existing.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({
      data: { action: "user.password_reset", entity: "user", entityId: existing.id, diff: { via: "cli", superadmin: true } },
    }),
  ]);
  console.log(`Acceso de ${username} restablecido; sus sesiones anteriores quedaron cerradas.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
