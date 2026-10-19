import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestDatabase, TEST_DATABASE_URL } from "./test-db-url.js";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Recrea el esquema aplicando prisma/migrations (incluye los CHECKs y el trigger de inmutabilidad),
 * igual que en producción: así las pruebas también validan las migraciones.
 */
export default function setup() {
  assertTestDatabase(TEST_DATABASE_URL);
  const opts = { cwd: apiRoot, stdio: "inherit" as const, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } };
  // Base de pruebas (assertTestDatabase): se vacía el esquema y se aplican las migraciones desde cero.
  execSync("npx prisma db execute --stdin --schema prisma/schema.prisma", {
    ...opts,
    stdio: ["pipe", "inherit", "inherit"],
    input: "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;",
  });
  execSync("npx prisma migrate deploy", opts);
}
