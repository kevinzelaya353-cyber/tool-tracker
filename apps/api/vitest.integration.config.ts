import { defineConfig } from "vitest/config";

/**
 * Pruebas de integración contra PostgreSQL real (servicio `postgres-test` de docker-compose).
 * Los archivos corren en serie porque comparten la base de datos.
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.int.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
