import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.expo/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_arg` = parámetro requerido por la firma pero sin usar (p. ej. el `next` de los error handlers de Express).
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Archivos de configuración que las herramientas cargan como CommonJS (p. ej. Metro).
    files: ["**/metro.config.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", __dirname: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
