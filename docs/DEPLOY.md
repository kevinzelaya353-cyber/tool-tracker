# Despliegue (GitHub Actions → VPS)

Dos entornos en el VPS de Oracle Cloud (`150.136.233.12`, Ubuntu 20.04 ARM64), sin Docker:
**Nginx (TLS) → PM2 → Node 22 → PostgreSQL 16**. El build se hace en GitHub Actions; el servidor solo recibe el paquete.
En el mismo VPS vive el Portal de Mantenimiento (`/srv/portal-*`, puertos 4001/4011, MySQL): nada de este proyecto lo toca.

| Rama | Entorno GitHub | Directorio | Puerto API | Base | Acceso |
|---|---|---|---|---|---|
| `develop` | `development` | `/srv/tooltracker-dev` | 4031 | `tooltracker_dev` (usuario `tt_dev`) | **No público**: Nginx en `127.0.0.1:8082`, por túnel SSH |
| `main` | `production` | `/srv/tooltracker-prod` | 4021 | `tooltracker_prod` (usuario `tt_prod`) | <https://herramientas.plexbird.com> |

## Flujo de trabajo

```text
rama feature/* ──PR──▶ develop ──(push)──▶ CI ▶ deploy a development
                         │
                         └──PR──▶ main ──(push)──▶ CI ▶ [aprobación] ▶ deploy a production
```

- **CI** (`.github/workflows/ci.yml`): en cada PR hacia `develop`/`main`. Lint, tipos, pruebas unitarias e integración
  contra un PostgreSQL 16 efímero (aplicando `prisma/migrations`).
- **Deploy** (`.github/workflows/deploy.yml`): en cada push a `develop`/`main`, o a mano (*Actions → Deploy → Run
  workflow*; producción solo desde `main`). CI → empaquetar → subir por SSH → `deploy/servidor/activar-release.sh`.
- **Empaquetado en ARM64 + Ubuntu 20.04.** La API usa módulos nativos (sharp, argon2, motores de Prisma). El paquete se
  arma en un runner `ubuntu-24.04-arm` dentro de un contenedor `ubuntu:20.04`: misma arquitectura, glibc y OpenSSL que el VPS.
  Contiene `api/` (dist + `node_modules` de producción + `prisma/`), `web/` (export de Expo), `deploy/` y `REVISION`.
- `activar-release.sh`: valida que el entorno sea coherente → si hay migraciones pendientes, **respaldo** (`pg_dump`, en
  `shared/backups`) y `prisma migrate deploy` → cambia `current` de forma atómica → `pm2 startOrReload` → comprueba
  `/health` y `/ready` (BD) desde el proceso PM2 de **esa** release, y que siga vivo tras 12 s → si falla, **vuelve sola**
  a la release anterior. Sin respaldo no migra. Conserva las 5 últimas releases.
- **El rollback solo revierte el código; las migraciones aplicadas quedan en la BD.** El log indica el respaldo previo.

Estructura en el servidor:

```text
/srv/tooltracker-prod/
├── current -> releases/20261019120000-abc1234
├── releases/<fecha>-<commit>/   (api/, web/, deploy/, REVISION)
└── shared/  .env · storage/ (fotos) · backups/ · logs/
```

## Estado del servidor (ya preparado)

- Usuario de sistema `tooltracker` (sin sudo), con Node 22 (nvm) y PM2 propio; arranque con `pm2-tooltracker.service`.
- PostgreSQL 16.9 desde `apt-archive.postgresql.org` (Ubuntu 20.04 ya no está en el repositorio oficial: esa versión
  no recibe más parches). Solo escucha en `127.0.0.1:5432`. Configuración en
  `/etc/postgresql/16/main/conf.d/tooltracker.conf`. Cada usuario solo puede entrar a su base.
- `shared/.env` de cada entorno generado en el servidor (`chmod 600`): claves de BD y JWT aleatorias.
  Plantillas en `deploy/env/`. **Los secretos de la app nunca van a GitHub.**
- Nginx: `snippets/tooltracker-app.conf`, sitios `tooltracker-prod` (80→443, TLS de Let's Encrypt) y `tooltracker-dev`
  (`127.0.0.1:8082`). El certificado se renueva solo (certbot.timer + hook que recarga Nginx).
- Firewall: 22, 80 y 443 abiertos (iptables + Security List de Oracle). 4021/4031/5432/8082 solo locales.
- Respaldo diario de producción (base + fotos) a las 03:45 UTC, cron de `tooltracker`.
- Copia de la configuración previa de Nginx e iptables: `/root/backup-tooltracker-20261019T101056Z/`.

### Reconstruir el servidor desde cero (referencia)

```bash
# PostgreSQL 16 (archivo de PGDG para focal) — como ubuntu con sudo
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg
echo "deb [arch=arm64 signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.gpg] https://apt-archive.postgresql.org/pub/repos/apt focal-pgdg main" \
  | sudo tee /etc/apt/sources.list.d/pgdg-archive.list
sudo apt-get update && sudo apt-get install -y postgresql-16 postgresql-client-16
sudo -u postgres psql -v ON_ERROR_STOP=1 -v prod_pw='<clave>' -v dev_pw='<clave>' -f deploy/postgres/crear-bases.sql

# Usuario y directorios
sudo adduser --disabled-password --gecos "" tooltracker
for e in prod dev; do
  sudo install -d -o tooltracker -g tooltracker -m 750 /srv/tooltracker-$e/{releases,shared} /srv/tooltracker-$e/shared/{storage,backups,logs}
  sudo setfacl -m u:www-data:--x /srv/tooltracker-$e /srv/tooltracker-$e/releases
done
# Como tooltracker: nvm + Node 22 + pm2; luego (como root) pm2 startup systemd -u tooltracker --hp /home/tooltracker
# shared/.env: copiar deploy/env/<entorno>.env.example y completar (chmod 600)

# Nginx + TLS
sudo cp deploy/nginx/snippets/tooltracker-app.conf /etc/nginx/snippets/
sudo cp deploy/nginx/sites/tooltracker-dev.conf /etc/nginx/sites-available/tooltracker-dev
sudo certbot certonly --webroot -w /var/www/letsencrypt -d herramientas.plexbird.com   # con un sitio :80 que sirva el webroot
sudo cp deploy/nginx/sites/tooltracker-prod.conf /etc/nginx/sites-available/tooltracker-prod
sudo ln -s /etc/nginx/sites-available/tooltracker-{prod,dev} /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
```

## Configurar GitHub (una vez, lo hace el dueño del repositorio)

En un repositorio de cuenta personal, **solo el dueño** puede crear entornos y secretos.

1. *Settings → Environments*: `development` (*Deployment branches*: `develop`) y `production` (*Required reviewers* +
   *Deployment branches*: `main`).
2. En **cada** entorno:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `SSH_PRIVATE_KEY` | Llave privada `tooltracker_deploy` (ed25519, solo para despliegue) |
   | Secret | `SSH_KNOWN_HOSTS` | Salida de `ssh-keyscan 150.136.233.12` (huellas verificadas abajo) |
   | Variable | `SSH_HOST` | `150.136.233.12` |
   | Variable | `SSH_PORT` | `22` |
   | Variable | `SSH_USER` | `tooltracker` |
   | Variable | `APP_DIR` | `/srv/tooltracker-dev` · `/srv/tooltracker-prod` |
   | Variable | `PM2_APP` | `tooltracker-dev` · `tooltracker-prod` |
   | Variable | `PUBLIC_URL` | `http://localhost:8082` · `https://herramientas.plexbird.com` |

3. *Settings → Branches*: proteger `main` y `develop` (exigir PR y el check **CI / Lint, tipos y pruebas**).

Huellas del VPS: ED25519 `SHA256:5JnFTT84WqvaoegpEq6lK9NMBAwnkRdseGbl6wVDNzg` ·
ECDSA `SHA256:7DpABOk/BQ+VJ0RVcLBa2w9DQWCQ9qW79RJFrylvYX4` · RSA `SHA256:HVGnqbudzHQt4iWF4fjjouYKh/YNEbpTDkpNT3IqJes`.

## Primer despliegue de cada entorno

1. Push a `develop` (o *Run workflow*). El deploy aplica las migraciones a la base vacía y arranca PM2.
2. Crear el administrador (una vez, como `tooltracker`):

   ```bash
   cd /srv/tooltracker-dev/current/api && node --env-file=/srv/tooltracker-dev/shared/.env prisma/seed.ts
   ```

   Después borrar `SEED_ADMIN_PASSWORD` de `shared/.env`.
3. Verificar: `curl -fsS http://127.0.0.1:4031/ready` → `{"status":"ok","db":"ok"}`.
4. Repetir con `main` → producción (`https://herramientas.plexbird.com/ready`).

## Actualización a multi-tenant (migración `3_multi_tenant`)

La migración asigna **todos** los datos existentes a la organización **"Ingenieria H"** y es atómica
(si falla, no cambia nada y `current` sigue en la versión anterior). El despliegue ya hace el
respaldo verificado antes de migrar. Pasos, primero en development y luego en producción:

1. **Antes** (como `tooltracker`), guardar los conteos para comparar:

   ```bash
   cd /srv/tooltracker-dev/current/api && set -a && . ../../shared/.env && set +a
   psql "${DATABASE_URL%%\?*}" -f prisma/ops/counts.sql > ~/conteos-antes.txt
   ```

2. Push a `develop` (o *Run workflow*): respaldo → `prisma migrate deploy` → arranque.
3. **Después**: comparar y verificar el aislamiento (todas las filas de "problema" en 0):

   ```bash
   cd /srv/tooltracker-dev/current/api && set -a && . ../../shared/.env && set +a
   psql "${DATABASE_URL%%\?*}" -f prisma/ops/counts.sql | diff ~/conteos-antes.txt - && echo "conteos idénticos"
   psql "${DATABASE_URL%%\?*}" -f prisma/ops/verify-tenancy.sql
   ```

4. **Crear el SuperAdmin** (una vez por entorno). La contraseña se pasa solo en el entorno del
   comando (no queda en `shared/.env` ni en el historial si se antepone un espacio):

   ```bash
   cd /srv/tooltracker-dev/current/api
    SUPERADMIN_USERNAME=super.admin SUPERADMIN_PASSWORD='…' \
     node --env-file=/srv/tooltracker-dev/shared/.env prisma/superadmin.ts create
   ```

   Recuperar el acceso si se pierde: lo mismo con `reset`.
5. Probar: entrar como SuperAdmin (sin organización), abrir "Ingenieria H" desde el panel de la
   plataforma; entrar como el admin de la empresa y comprobar que todo sigue igual.
6. Repetir con `main` → producción.

**Reversión:** con UNA sola organización, `psql … -1 -f prisma/ops/rollback-3_multi_tenant.sql` y
desplegar la versión anterior. Con más de una, restaurar el respaldo de `shared/backups` tomado
antes de migrar. Detalle en `docs/MULTI_TENANT.md`.

**Publicar la app nueva junto con la API.** Con la app anterior, los usuarios de "Ingenieria H"
siguen entrando y operando (sus tokens viejos se rechazan una vez y la app los renueva sola), pero
los roles sin permiso de ver montos (Bodeguero, Supervisor, Lector) verán un error de permisos en
los paneles de dinero del tablero y de Reportes (la API ahora responde 403 y lo audita como acceso
denegado). Solo la app nueva tiene el panel de plataforma, las sesiones de soporte, los valores en
el listado y el detalle de las gráficas.

## Acceso a development (no público)

```powershell
ssh -i $HOME\.ssh\ssh-key-2026-10-17.key -L 8082:127.0.0.1:8082 ubuntu@150.136.233.12
# con el túnel abierto: http://localhost:8082
```

## Operación (como `tooltracker`: `sudo -iu tooltracker`)

| Tarea | Comando |
|---|---|
| Estado / logs | `pm2 status` · `pm2 logs tooltracker-prod` · `tail -f /srv/tooltracker-prod/shared/logs/error.log` |
| Versión activa | `cat /srv/tooltracker-prod/current/REVISION` |
| Rollback de código | `APP_DIR=/srv/tooltracker-prod PM2_APP=tooltracker-prod bash /srv/tooltracker-prod/current/deploy/servidor/rollback.sh [release]` |
| Respaldo manual | `APP_DIR=/srv/tooltracker-prod FOTOS=1 bash /srv/tooltracker-prod/current/deploy/servidor/respaldo.sh` |
| Restaurar un respaldo | `pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL sin ?schema>" shared/backups/respaldo_…/bd.dump` (detener PM2 antes) |

Los respaldos en el mismo disco no protegen de perder el VPS: copiarlos fuera (rclone/restic a un bucket).

## Problemas comunes

| Síntoma | Causa |
|---|---|
| `Falta la variable/secreto …` en Actions | Variable/secret no definido en el **entorno** (no en el repo) |
| `Host key verification failed` | `SSH_KNOWN_HOSTS` vacío o desactualizado |
| `configuración incoherente` | `shared/.env` con puerto, base o usuario de otro entorno |
| `no se pudo consultar el estado de las migraciones` | PostgreSQL caído o credenciales de `shared/.env` |
| 502 de Nginx | PM2 caído o puerto distinto entre `shared/.env` y el sitio de Nginx |
