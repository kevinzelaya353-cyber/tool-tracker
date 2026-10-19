#!/usr/bin/env bash
# Activa una release ya extraída en $APP_DIR/releases/<release> (lo invoca .github/workflows/deploy.yml por SSH).
#   0) valida que APP_DIR, PM2_APP, ENTORNO y shared/.env correspondan al MISMO entorno (lib/entorno.sh)
#   1) si hay migraciones pendientes: respaldo verificado (pg_dump) + `prisma migrate deploy`
#   2) cambia el enlace `current` de forma atómica   3) recarga PM2 y comprueba /health y /ready de la release nueva
#   4) si no queda sana, vuelve a la release anterior (o, en el primer despliegue, deja el entorno sin release activa)
#   5) conserva las últimas $CONSERVAR releases
# Uso: APP_DIR=/srv/tooltracker-prod PM2_APP=tooltracker-prod ENTORNO=production bash activar-release.sh <release>
#
# IMPORTANTE: el rollback (automático o manual) solo vuelve el CÓDIGO; las migraciones aplicadas quedan en la BD. Si una
# migración rompe datos, se restaura el respaldo previo (ruta en el log: RESPALDO_LISTO=…). Sin respaldo no se migra.
set -euo pipefail

DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/entorno.sh
. "$DIR_SCRIPT/lib/entorno.sh"
cargar_node

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fallar() { log "ERROR: $*"; exit 1; }

RELEASE="${1:?Uso: activar-release.sh <release>}"
: "${APP_DIR:?Falta APP_DIR}" "${PM2_APP:?Falta PM2_APP}" "${ENTORNO:?Falta ENTORNO (production | development)}"
APP_DIR="${APP_DIR%/}"
CONSERVAR="${CONSERVAR:-5}"
ESTABILIDAD_SEG="${ESTABILIDAD_SEG:-12}" # > min_uptime de PM2 (10 s): detecta una release que arranca y se cae
REL="$APP_DIR/releases/$RELEASE"
SHARED="$APP_DIR/shared"

# El nombre llega por SSH desde el workflow: solo un componente de ruta (sin / ni ..).
[[ "$RELEASE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$RELEASE" != *..* ]] || fallar "nombre de release no válido: $RELEASE"
[[ "$CONSERVAR" =~ ^[0-9]+$ ]] && [ "$CONSERVAR" -ge 2 ] || fallar "CONSERVAR debe ser un entero ≥ 2"

# 0) Coherencia del entorno ANTES de tocar nada.
PROBLEMAS="$(problemas_entorno "$ENTORNO" "$APP_DIR" "$PM2_APP")"
if [ -n "$PROBLEMAS" ]; then
  while IFS= read -r p; do log "ERROR: $p"; done <<< "$PROBLEMAS"
  fallar "configuración incoherente para ENTORNO=$ENTORNO: no se modificó nada"
fi
[ -d "$REL" ] && [ ! -L "$REL" ] || fallar "la release no es un directorio real: $REL"
[ -f "$REL/api/dist/server.js" ] || fallar "release incompleta: falta api/dist/server.js"
[ -f "$REL/web/index.html" ] || fallar "release incompleta: falta web/index.html"
command -v node >/dev/null || fallar "node no está en el PATH (nvm del usuario de la app)"
command -v pm2 >/dev/null || fallar "pm2 no está en el PATH (npm i -g pm2)"
command -v curl >/dev/null || fallar "curl no está instalado"

# Un solo despliegue/rollback a la vez por entorno.
exec 8>"$SHARED/.despliegue.lock"
flock -n 8 || fallar "otro despliegue o rollback está en curso en $APP_DIR"

PORT="$(leer_env "$SHARED/.env" PORT)"
mkdir -p "$SHARED/storage" "$SHARED/backups" "$SHARED/logs"
RELEASES_REAL="$(readlink -e "$APP_DIR/releases")"
REL_REAL="$(readlink -f "$REL")"

# Nginx (www-data) solo puede leer el frontend estático de la release; la API y la config no.
setfacl -m u:www-data:--x "$REL" "$REL/web"
setfacl -R -m u:www-data:rX "$REL/web"

responde() {
  curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 &&
    curl -fsS --max-time 3 "http://127.0.0.1:$PORT/ready" >/dev/null 2>&1
}

# PID y directorio de trabajo real del proceso PM2 de este entorno (falla si no corre).
cwd_pm2() {
  local pid
  pid="$(pm2 pid "$PM2_APP" 2>/dev/null | tr -dc '0-9\n' | tail -n 1)"
  [ -n "$pid" ] && [ "$pid" != "0" ] && [ -d "/proc/$pid" ] || return 1
  printf '%s %s\n' "$pid" "$(readlink -f "/proc/$pid/cwd" 2>/dev/null)"
}

# Si algo ya responde en :PORT y no es el proceso PM2 de una release de ESTE entorno, el puerto es de otro servicio.
if curl -fsS --max-time 3 "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
  case "$(cwd_pm2 | cut -d' ' -f2-)" in
    "$RELEASES_REAL"/*/api) ;;
    *) fallar "algo ya responde en :$PORT y no es $PM2_APP de $APP_DIR: no se migra ni se activa" ;;
  esac
fi

# 1) Migraciones (Prisma lee DATABASE_URL del entorno). `migrate status` sale con ≠ 0 si hay pendientes o si no conecta.
prisma() { (cd "$REL/api" && set -a && . "$SHARED/.env" && set +a && node node_modules/prisma/build/index.js "$@"); }
MIGRADO=no
RESPALDO=""
if ESTADO="$(prisma migrate status 2>&1)"; then
  log "Sin migraciones pendientes"
else
  grep -qiE "not yet been applied|following migrations? ha(s|ve) not" <<< "$ESTADO" \
    || { printf '%s\n' "$ESTADO"; fallar "no se pudo consultar el estado de las migraciones (¿PostgreSQL caído o credenciales de shared/.env?)"; }
  log "Hay migraciones pendientes; respaldo previo…"
  SALIDA="$(APP_DIR="$APP_DIR" FOTOS=0 bash "$DIR_SCRIPT/respaldo.sh" 2>&1)" \
    || { printf '%s\n' "$SALIDA"; fallar "el respaldo falló: NO se migra ni se activa la release (current sigue igual)"; }
  RESPALDO="$(sed -n 's/^RESPALDO_LISTO=//p' <<< "$SALIDA" | tail -n 1)"
  [ -n "$RESPALDO" ] && [ -f "$RESPALDO/bd.dump" ] || fallar "el respaldo no informó su carpeta: no se migra"
  log "Respaldo listo: $RESPALDO"
  MIGRADO=si
  prisma migrate deploy || fallar "la migración falló; current NO cambió. Respaldo previo: $RESPALDO"
fi

# 2) Cambio atómico de `current`. PREVIO solo si `current` ya apuntaba a una release existente.
PREVIO=""
if [ -L "$APP_DIR/current" ]; then PREVIO="$(readlink -e "$APP_DIR/current" 2>/dev/null || true)"; fi
ln -sfn "$REL" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
log "current → $RELEASE"

recargar() {
  APP_DIR="$APP_DIR" PM2_APP="$PM2_APP" pm2 startOrReload "$APP_DIR/current/deploy/pm2/ecosystem.config.cjs" --update-env || return 1
  pm2 save >/dev/null
}

# PID del proceso PM2 que corre la release $1 (por su directorio de trabajo real); vacío si no es esa release.
pid_de() {
  local l
  l="$(cwd_pm2)" || return 1
  [ "${l#* }" = "$1/api" ] || return 1
  echo "${l%% *}"
}

# Sana = /health y /ready responden desde el proceso PM2 de ESTA release y sigue vivo tras ESTABILIDAD_SEG segundos.
sana() {
  local destino="$1" pid=""
  for _ in $(seq 1 30); do
    if responde && pid="$(pid_de "$destino")"; then break; fi
    pid=""; sleep 2
  done
  [ -n "$pid" ] || { log "No responde /health + /ready desde $(basename "$destino") en :$PORT"; return 1; }
  sleep "$ESTABILIDAD_SEG"
  [ "$(pid_de "$destino" || true)" = "$pid" ] || { log "El proceso de $(basename "$destino") se reinició (PID $pid)"; return 1; }
  responde || { log "Dejó de responder tras ${ESTABILIDAD_SEG}s"; return 1; }
}

# 3) Recarga y verificación; 4) vuelta atrás si la nueva versión no queda sana.
recargar || log "pm2 startOrReload falló"
if sana "$REL_REAL"; then
  log "Release $RELEASE sana en :$PORT"
else
  log "La release no quedó sana; últimas líneas del log:"
  pm2 logs "$PM2_APP" --lines 40 --nostream || true
  if [ -n "$PREVIO" ] && [ -d "$PREVIO/api/dist" ] && [ "$PREVIO" != "$REL_REAL" ]; then
    ln -sfn "$PREVIO" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
    recargar || log "pm2 startOrReload falló al volver atrás"
    if sana "$PREVIO"; then log "Restaurada la release anterior: $(basename "$PREVIO")"; else log "La release anterior tampoco responde"; fi
  else
    log "No hay release anterior (primer despliegue): se retira current y el proceso PM2"
    [ "$(readlink -f "$APP_DIR/current" 2>/dev/null)" = "$REL_REAL" ] && rm -f -- "$APP_DIR/current"
    pm2 delete "$PM2_APP" >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
  [ "$MIGRADO" = no ] || log "ATENCIÓN: las migraciones aplicadas NO se revirtieron. Respaldo previo: $RESPALDO"
  fallar "despliegue fallido"
fi

# 5) Limpieza: conserva las $CONSERVAR releases más recientes (<fecha UTC>-<commit>); nunca la activa ni la previa.
ACTIVA="$(readlink -e "$APP_DIR/current")"
n=0
while IFS= read -r nombre; do
  [ -n "$nombre" ] || continue
  n=$((n + 1)); [ "$n" -gt "$CONSERVAR" ] || continue
  d="$RELEASES_REAL/$nombre"
  case "$d" in "$ACTIVA" | "$PREVIO" | "$REL_REAL") continue ;; esac
  [ ! -L "$d" ] && rm -rf -- "$d" && log "Limpieza: eliminada $nombre"
done < <(find "$RELEASES_REAL" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
  -regex '.*/[0-9]{14}-[0-9a-f]{7,40}' -printf '%f\n' | sort -r)
log "Listo"
