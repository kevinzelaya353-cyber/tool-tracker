// Configuración de Metro para el monorepo pnpm (node_modules plano en la raíz).
// Nota: el proyecto NO debe vivir dentro de OneDrive: OneDrive marca los archivos con
// reparse points "cloud" y Metro los descarta como si fueran enlaces simbólicos.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
