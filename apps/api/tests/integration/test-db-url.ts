// Sin la variable en el entorno, se toma de apps/api/.env (PostgreSQL local, sin Docker).
if (!process.env.TEST_DATABASE_URL) {
  try {
    process.loadEnvFile(new URL("../../.env", import.meta.url));
  } catch {
    // sin .env: se usa el valor por defecto (servicio postgres-test de docker-compose)
  }
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  // connection_limit alto: las pruebas de concurrencia abren muchas transacciones a la vez.
  "postgresql://tt:tt_test_password@localhost:5433/tool_tracker_test?schema=public&connection_limit=25";

/** Barrera contra borrar por error una base que no es de pruebas. */
export function assertTestDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) {
    throw new Error(`Por seguridad, la base de pruebas debe contener "test" en su nombre (recibido: "${name}")`);
  }
}
