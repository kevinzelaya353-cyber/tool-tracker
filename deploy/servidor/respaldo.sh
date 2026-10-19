#!/usr/bin/env bash
# Respaldo de la base (pg_dump, formato custom) y, con FOTOS=1, de las fotos de shared/storage.
# Lo usa activar-release.sh antes de migrar, y cron a diario en producción (docs/DEPLOY.md).
# Uso: APP_DIR=/srv/tooltracker-prod bash respaldo.sh        (FOTOS=1 para incluir las fotos)
# El respaldo se arma en una carpeta oculta y solo se publica como respaldo_<base>_<sello>Z si pg_restore lo puede leer
# y las sumas SHA256 verifican. Imprime RESPALDO_LISTO=<carpeta> al final.
set -euo pipefail
: "${APP_DIR:?Falta APP_DIR}"
APP_DIR="${APP_DIR%/}"
DIR_SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/entorno.sh
. "$DIR_SCRIPT/lib/entorno.sh"

SHARED="$APP_DIR/shared"
DESTINO="$SHARED/backups"
RETENCION_DIAS="${RETENCION_DIAS:-14}"
RETENCION_MINIMA="${RETENCION_MINIMA:-3}"

URL="$(leer_env "$SHARED/.env" DATABASE_URL)"
[ -n "$URL" ] || { echo "DATABASE_URL vacío en $SHARED/.env" >&2; exit 1; }
BD="$(db_nombre "$URL")"
command -v pg_dump >/dev/null || { echo "pg_dump no está instalado" >&2; exit 1; }

SELLO="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$DESTINO/respaldo_${BD}_${SELLO}"
TMP="$DESTINO/.en-curso_${BD}_${SELLO}"
mkdir -p "$DESTINO"
trap 'rm -rf -- "$TMP"' EXIT
install -d -m 700 "$TMP"

pg_dump --dbname="$(db_url_libpq "$URL")" --format=custom --no-owner --file="$TMP/bd.dump"
pg_restore --list "$TMP/bd.dump" >/dev/null # falla si el volcado está truncado o corrupto

if [ "${FOTOS:-0}" = 1 ] && [ -d "$SHARED/storage" ]; then
  tar -C "$SHARED" -czf "$TMP/fotos.tar.gz" storage
  gzip -t "$TMP/fotos.tar.gz"
fi
{
  echo "bd=$BD"
  echo "fecha=$SELLO"
  echo "release=$(sed -n 's/^release=//p' "$APP_DIR/current/REVISION" 2>/dev/null || echo ninguna)"
  echo "fotos=$([ -f "$TMP/fotos.tar.gz" ] && echo si || echo no)"
} > "$TMP/RESPALDO.info"
(cd "$TMP" && sha256sum -- * > SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
chmod 600 "$TMP"/*
mv -T "$TMP" "$FINAL"
trap - EXIT

# Retención: borra los de más de RETENCION_DIAS, pero conserva siempre los RETENCION_MINIMA más recientes de esta base.
mapfile -t TODOS < <(find "$DESTINO" -mindepth 1 -maxdepth 1 -type d -name "respaldo_${BD}_*Z" -printf '%f\n' | sort -r)
for i in "${!TODOS[@]}"; do
  [ "$i" -ge "$RETENCION_MINIMA" ] || continue
  d="$DESTINO/${TODOS[$i]}"
  if [ -n "$(find "$d" -maxdepth 0 -mtime +"$RETENCION_DIAS")" ]; then rm -rf -- "$d"; fi
done
echo "RESPALDO_LISTO=$FINAL"
