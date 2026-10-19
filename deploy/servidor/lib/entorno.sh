# Comprobaciones de entorno compartidas (se carga con `source`): activar-release.sh, rollback.sh, respaldo.sh.
# Cada entorno tiene directorio, proceso PM2, puerto y base FIJOS. Una variable mal puesta en GitHub o un shared/.env
# copiado del otro entorno se detecta ANTES de tocar nada. En el mismo VPS vive el Portal de Mantenimiento: sus puertos
# (4001/4011) y directorios (/srv/portal-*) nunca son válidos aquí.

# Lee KEY de un archivo .env (sin comillas ni \r). Vacío si no existe.
leer_env() { grep -E "^$2=" "$1" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' | sed 's/^"//;s/"$//' || true; }

# Node y PM2 instalados con nvm para el usuario de la app (las sesiones SSH no interactivas no cargan ~/.bashrc).
cargar_node() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
}

# entorno_esperado <entorno> → define ESP_* (este entorno) y OTRO_APP_DIR. Sale con 1 si el entorno no existe.
entorno_esperado() {
  case "$1" in
    production)
      ESP_APP_DIR=/srv/tooltracker-prod ESP_PM2=tooltracker-prod ESP_DB=tooltracker_prod ESP_DB_USER=tt_prod ESP_PORT=4021
      OTRO_APP_DIR=/srv/tooltracker-dev ;;
    development)
      ESP_APP_DIR=/srv/tooltracker-dev ESP_PM2=tooltracker-dev ESP_DB=tooltracker_dev ESP_DB_USER=tt_dev ESP_PORT=4031
      OTRO_APP_DIR=/srv/tooltracker-prod ;;
    *) return 1 ;;
  esac
}

# entorno_de_app_dir <APP_DIR> → imprime production/development según el directorio.
entorno_de_app_dir() {
  local e
  for e in production development; do
    entorno_esperado "$e"
    [ "${1%/}" != "$ESP_APP_DIR" ] || { echo "$e"; return 0; }
  done
  return 1
}

# Partes de DATABASE_URL (postgresql://usuario:clave@host:puerto/base?params). Nunca imprime la clave.
db_usuario() { sed -E 's#^postgres(ql)?://([^:@/]+).*#\2#' <<< "$1"; }
db_host() { sed -E 's#^postgres(ql)?://[^@]*@([^:/?]+).*#\2#' <<< "$1"; }
db_nombre() { sed -E 's#^postgres(ql)?://[^/]*/([^?]+).*#\2#' <<< "$1"; }
# URL sin parámetros de Prisma (?schema=…): pg_dump/psql no los aceptan.
db_url_libpq() { echo "${1%%\?*}"; }

# problemas_entorno <entorno> <APP_DIR> <PM2_APP> → imprime un problema por línea (nada = coherente).
problemas_entorno() {
  local entorno="$1" app_dir="${2%/}" pm2_app="$3" env url puerto alm
  entorno_esperado "$entorno" || { echo "ENTORNO='$entorno' no válido (production | development)"; return 0; }
  [ "$app_dir" = "$ESP_APP_DIR" ] || echo "APP_DIR=$app_dir no corresponde a $entorno (esperado $ESP_APP_DIR)"
  [ "$pm2_app" = "$ESP_PM2" ] || echo "PM2_APP=$pm2_app no corresponde a $entorno (esperado $ESP_PM2)"
  if [ -e "$OTRO_APP_DIR" ] && [ "$(readlink -f "$app_dir")" = "$(readlink -f "$OTRO_APP_DIR")" ]; then
    echo "$app_dir y $OTRO_APP_DIR son el mismo directorio real"
  fi
  env="$app_dir/shared/.env"
  [ -f "$env" ] || { echo "falta $env"; return 0; }
  url="$(leer_env "$env" DATABASE_URL)"
  [ -n "$url" ] || echo "DATABASE_URL vacío en $env"
  [ "$(db_nombre "$url")" = "$ESP_DB" ] || echo "DATABASE_URL apunta a la base '$(db_nombre "$url")' (esperada $ESP_DB)"
  [ "$(db_usuario "$url")" = "$ESP_DB_USER" ] || echo "DATABASE_URL usa el usuario '$(db_usuario "$url")' (esperado $ESP_DB_USER)"
  case "$(db_host "$url")" in localhost | 127.0.0.1) ;; *) echo "DATABASE_URL debe ser local (localhost)" ;; esac
  puerto="$(leer_env "$env" PORT)"
  [ "$puerto" = "$ESP_PORT" ] || echo "PORT=${puerto:-vacío} no corresponde a $entorno (esperado $ESP_PORT)"
  [ "$(leer_env "$env" NODE_ENV)" = production ] || echo "NODE_ENV debe ser production (también en development: es un build de producción)"
  alm="$(leer_env "$env" LOCAL_STORAGE_DIR)"
  case "$alm" in "$app_dir/shared/storage") ;; *) echo "LOCAL_STORAGE_DIR=$alm debe ser $app_dir/shared/storage" ;; esac
  return 0
}
