import { defineConfig } from "vitest/config";

// Pruebas unitarias: sin base de datos ni servicios externos.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/*.int.test.ts", "node_modules/**"],
  },
});
