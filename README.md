# Tool Tracker

Sistema de gestión y trazabilidad de herramientas menores.

| Paquete | Contenido |
|---|---|
| `packages/shared` | Enums, máquina de estados, esquemas Zod (usados por API y app) |
| `apps/api` | Node + Express 5 + Prisma + PostgreSQL |
| `apps/mobile` | React Native + Expo (fase 5) |

## Requisitos

- Node.js 22+ y pnpm 9
- PostgreSQL 16 instalado en Windows (servicio local, puerto 5432), con las bases
  `tool_tracker` y `tool_tracker_test` y el usuario `tt`
- Docker es opcional: solo si prefieres `docker-compose.yml` con MinIO en lugar de fotos en disco
- **No poner el proyecto dentro de OneDrive** (ni carpetas sincronizadas): OneDrive marca los
  archivos de `node_modules` como "nube" y Metro los ignora, así que el bundle de Expo falla con
  "Unable to resolve module expo-router/entry". Por eso `.npmrc` usa `package-import-method=copy`.

## Primer arranque (sin Docker)

```bash
pnpm install
pnpm --filter @tt/shared build
pnpm --filter @tt/api exec prisma generate
pnpm db:setup        # migraciones (tablas + reglas SQL) + admin, bodega y categorías (usa apps/api/.env)
pnpm dev:api         # http://localhost:3000/health
pnpm dev:mobile      # QR para Expo Go
```

`apps/api/.env` usa `STORAGE_DRIVER=local`: las fotos se guardan en `apps/api/storage/` y se
sirven con URLs firmadas en `/files/…`. `API_PUBLIC_URL` y `apps/mobile/.env` deben usar la IP
de la PC en la red local para que el teléfono llegue.

En VS Code: `Ctrl+Shift+B` ejecuta "Iniciar todo" (API + app móvil).

## Pruebas

```bash
pnpm test        # unitarias (reglas de dominio, permisos, imágenes, tokens, almacenamiento)
pnpm test:int    # integración contra tool_tracker_test (TEST_DATABASE_URL de apps/api/.env)
```

Las pruebas de integración cubren auth, herramientas, traslados (incluida la concurrencia),
ciclo de vida, reportes con montos conocidos y seguridad. La revisión de seguridad está en
[SECURITY.md](SECURITY.md).

## App móvil

```bash
cp apps/mobile/.env.example apps/mobile/.env   # EXPO_PUBLIC_API_URL = IP de tu PC en la LAN
cd apps/mobile && npx expo install --fix         # alinea versiones nativas con el SDK instalado
pnpm dev:mobile                                  # abre con Expo Go o un development build
```

Pantallas: login (usuario + PIN de 4 dígitos; contraseña completa para administradores), inicio (inventario por estado y accesos rápidos), herramientas (búsqueda,
filtros y QR), detalle con historial y fotos, alta de herramienta, eventos (daño, extravío,
mantenimiento, recuperación, baja), traslados y wizard de traslado en 4 pasos con cámara
de varias fotos. Las acciones visibles dependen de los permisos del rol y de la máquina de estados.
Desde Perfil, el administrador registra usuarios, cambia roles y PIN, y desbloquea cuentas.

**Traslados con chofer.** Un traslado puede ser directo (llega en el acto) o con chofer: las
herramientas quedan **En tránsito**, sin ubicación y a cargo del chofer, hasta que se confirma la
llegada con una lista de verificación (llegó bien / llegó dañada / no llegó) y fotos. Confirma quien
recibe desde su sesión, escribiendo su PIN en el teléfono del chofer, o un bodeguero/administrador en
su nombre (queda registrado cuál). Lo que no llegó queda extraviado a cargo del chofer. El rol
**Chofer** registra salidas y entregas, ve su carga en el inicio y no ve costos. Las fotos tomadas
con la cámara guardan dónde se tomaron, y el detalle avisa si la de recepción está lejos del destino.

El Excel exportado incluye la pestaña **Bitácora**: todo lo que registraron todos los usuarios,
en orden de fecha y hora y agrupado por día. Las horas se muestran en la zona de `REPORTS_TZ`
(para Honduras: `America/Tegucigalpa`).

## API (todas bajo `/api`, con `Authorization: Bearer` salvo auth)

| Método y ruta | Permiso |
|---|---|
| `POST /auth/login` · `/auth/refresh` · `/auth/logout` · `GET /auth/me` | — |
| `GET /users` · `POST /users` · `PATCH /users/:id` | users:read / users:manage |
| `GET /audit` | audit:read |
| `GET\|POST /categories` · `GET\|POST /locations` · `GET\|POST /vehicles` (+ `PATCH /:id`) | tools:read / catalog:write |
| `GET /tools` · `GET /tools/:id` · `GET /tools/by-code/:code` · `GET /tools/:id/history` | tools:read |
| `POST /tools` · `PATCH /tools/:id` | tools:write |
| `GET /transfers` · `GET /transfers/:id` · `POST /transfers` | transfers:read / transfers:create |
| `POST /lifecycle-events` | lifecycle:create (+ lifecycle:decommission para baja) |
| `POST /media` (multipart, campo `photos`, máx. 5 × 15 MB) | transfers:create, lifecycle:create o tools:write |
| `POST /media/urls` `{ ids, variant }` → URLs firmadas (10 min) · `DELETE /media/:id` (solo autor, sin asociar) | tools:read |

| `GET /reports/summary` · `/reports/spend-by-category?from&to` · `/reports/spend-over-time?from&to&granularity=month\|year` · `/reports/losses?from&to` | reports:read |

### Reportes financieros

- **Pérdida** = herramienta que hoy está dañada, extraviada o dada de baja, valorada a su precio
  de compra y fechada en el evento que la sacó de un estado sano. Si se repara o recupera, sale del reporte.
- **Mantenimiento** = `cost` de eventos de mantenimiento y de daño (reparaciones).
- Los meses y años se agrupan en la zona horaria `REPORTS_TZ`. Los montos se calculan en
  PostgreSQL (NUMERIC) y viajan como texto.

### Flujo de fotos

1. La app sube las fotos a `POST /media` y recibe sus `id`.
2. Envía esos `id` en `photoIds` al crear el traslado o el evento.
3. Las fotos sin asociar se purgan a las 24 h. El bucket es privado; se leen con URLs firmadas.
4. Cada foto se valida por magic bytes (JPEG/PNG/WEBP), se re-codifica a JPEG ≤ 2048 px sin
   metadatos EXIF (GPS, dispositivo) y se genera una miniatura de 320 px.

## Reglas de dominio

- `tools.status` y `tools.current_location_id` son derivados: solo cambian dentro de una
  transacción que inserta el `lifecycle_event` correspondiente.
- `lifecycle_events` es de solo inserción (trigger en BD).
- Transiciones válidas: `packages/shared/src/state-machine.ts`.
- Pérdidas = precio de compra de herramientas en `DANADA`, `EXTRAVIADA` o `DADA_DE_BAJA`.
