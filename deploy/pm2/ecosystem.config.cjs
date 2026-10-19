// PM2: un proceso por entorno. Lo usa deploy/servidor/activar-release.sh con APP_DIR y PM2_APP definidos.
// La configuración (puerto, BD, secretos) está en $APP_DIR/shared/.env y la carga Node con --env-file.
// Rutas por el enlace `current`: cada recarga arranca la release a la que apunta en ese momento.
const appDir = process.env.APP_DIR;
const nombre = process.env.PM2_APP;
if (!appDir || !nombre) throw new Error("Definir APP_DIR y PM2_APP (ej. APP_DIR=/srv/tooltracker-prod PM2_APP=tooltracker-prod)");

module.exports = {
  apps: [
    {
      name: nombre,
      cwd: `${appDir}/current/api`,
      script: `${appDir}/current/api/dist/server.js`,
      node_args: `--env-file=${appDir}/shared/.env`,
      exec_mode: "fork",
      instances: 1,
      kill_timeout: 10_000,
      max_memory_restart: "600M",
      // Reinicios con espera creciente si falla al arrancar (p. ej. PostgreSQL caído): evita un bucle a máxima velocidad.
      exp_backoff_restart_delay: 200,
      max_restarts: 15,
      min_uptime: "10s",
      time: true,
      out_file: `${appDir}/shared/logs/out.log`,
      error_file: `${appDir}/shared/logs/error.log`,
      merge_logs: true,
    },
  ],
};
