import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertTestDatabase, TEST_DATABASE_URL } from "./test-db-url.js";

const apiRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * Recrea el esquema desde schema.prisma y aplica las restricciones SQL adicionales
 * (CHECKs y trigger de inmutabilidad), igual que en producción.
 */
export default function setup() {
  assertTestDatabase(TEST_DATABASE_URL);
  const opts = { cwd: apiRoot, stdio: "inherit" as const, env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL } };
  execSync("npx prisma db push --force-reset --skip-generate --accept-data-loss", opts);
  execSync("npx prisma db execute --file prisma/sql/constraints.sql --schema prisma/schema.prisma", opts);
}
