#!/usr/bin/env bash
# Vuelve a una release anterior (solo código; la BD queda como está).
# Uso: APP_DIR=/srv/tooltracker-prod PM2_APP=tooltracker-prod bash rollback.sh [release]
#   sin argumento → la release inmediatamente anterior a la activa; `ls $APP_DIR/releases` lista las disponibles.
# IMPORTANTE: NO revierte migraciones. Si además hay que deshacer datos, restaurar el respaldo de shared/backups
# previo a la migración (docs/DEPLOY.md, "Restaurar un respaldo").
set -euo pipefail
: "${APP_DIR:?Falta APP_DIR}" "${PM2_APP:?Falta PM2_APP}"
APP_DIR="${APP_DIR%/}"
DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/entorno.sh
. "$DIR_SCRIPT/lib/entorno.sh"
cargar_node

ENTORNO="${ENTORNO:-$(entorno_de_app_dir "$APP_DIR" || true)}"
PROBLEMAS="$(problemas_entorno "$ENTORNO" "$APP_DIR" "$PM2_APP")"
[ -z "$PROBLEMAS" ] || { printf 'ERROR: %s\n' "$PROBLEMAS"; echo "Rollback cancelado: no se modificó nada"; exit 1; }
exec 8>"$APP_DIR/shared/.despliegue.lock"
flock -n 8 || { echo "Otro despliegue o rollback está en curso en $APP_DIR"; exit 1; }

RELEASES="$(readlink -e "$APP_DIR/releases")"
ACTIVA="$(readlink -e "$APP_DIR/current" || true)"
[ -n "$ACTIVA" ] || { echo "No hay release activa (current no existe)"; exit 1; }
if [ -n "${1:-}" ]; then
  [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$1" != *..* ]] || { echo "Nombre de release no válido: $1"; exit 1; }
  DESTINO="$RELEASES/$1"
else
  SIGUIENTE="$(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended \
    -regex '.*/[0-9]{14}-[0-9a-f]{7,40}' -printf '%f\n' | sort -r | grep -A1 -xF "$(basename "$ACTIVA")" | sed -n 2p || true)"
  DESTINO="${SIGUIENTE:+$RELEASES/$SIGUIENTE}"
fi
[ -n "$DESTINO" ] && [ -f "$DESTINO/api/dist/server.js" ] && [ ! -L "$DESTINO" ] || { echo "No hay release a la que volver (${DESTINO:-ninguna})"; exit 1; }
[ "$(readlink -f "$DESTINO")" != "$ACTIVA" ] || { echo "$(basename "$DESTINO") ya es la release activa"; exit 1; }

echo "Activa:  $(basename "$ACTIVA")"
echo "Destino: $(basename "$DESTINO")"
ln -sfn "$DESTINO" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
APP_DIR="$APP_DIR" PM2_APP="$PM2_APP" pm2 startOrReload "$APP_DIR/current/deploy/pm2/ecosystem.config.cjs" --update-env
pm2 save >/dev/null
PORT="$(leer_env "$APP_DIR/shared/.env" PORT)"
echo "Rollback hecho (solo código). Verificar: curl -fsS http://127.0.0.1:$PORT/ready"
