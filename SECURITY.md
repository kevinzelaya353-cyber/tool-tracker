# Revisión de seguridad: fase 7

Revisión del código de las fases 0 a 6 (API, base de datos y app móvil), hecha el 2026-10-15.
Las pruebas que respaldan cada control están en `apps/api/tests/integration/security.int.test.ts`,
salvo que se indique otra.

> **Estado (2026-10-15):** verificado. 81 pruebas unitarias y 80 de integración pasan contra
> PostgreSQL 16 local, incluidas las 35 de seguridad.

## Hallazgos corregidos en esta fase

| # | Severidad | Hallazgo | Corrección |
|---|---|---|---|
| 1 | Media | `trust proxy` fijo en 1. Expuesta sin proxy, un cliente podía falsear `X-Forwarded-For` y evadir el rate limit. | Variable `TRUST_PROXY` (por defecto 0). |
| 2 | Media | El límite de login era solo por IP. La fuerza bruta distribuida contra una cuenta no se frenaba. | Segundo limitador por correo: 10 fallos en 15 min. |
| 3 | Media | Cualquier BODEGUERO podía cambiar el precio o la fecha de compra ya registrados, lo que altera los reportes financieros. | Nuevo permiso `tools:financial`, solo para ADMIN. Prueba en `tools.int.test.ts`. |
| 4 | Baja | `redact()` del audit log desarmaba los `Decimal` en sus campos internos: los montos auditados quedaban ilegibles. | Solo recorre objetos planos; las demás instancias usan su `toJSON`. Prueba unitaria y de integración. |
| 5 | Baja | `created_at` de los eventos usaba `now()` (inicio de la transacción). Con eventos concurrentes en el mismo instante, el historial podía ordenarse al revés de como se confirmaron. | `clock_timestamp()`. Prueba de concurrencia en `lifecycle.int.test.ts`. |
| 6 | Baja | Un byte NUL en un texto producía un error 500 de PostgreSQL. | Se rechaza en la validación (400). |

## Controles verificados

**Autenticación**
- Contraseñas con argon2id. Hash señuelo para que el tiempo de respuesta no revele qué cuentas existen. Mismo mensaje de error en todos los casos de fallo.
- Access token JWT HS256 de 15 min, con `iss`, `aud` y algoritmo fijo (rechaza `alg: none` y firmas falsas).
- Refresh token aleatorio de 384 bits, guardado como HMAC y rotado en cada uso. La reutilización revoca toda la sesión y se audita. La revocación condicional evita carreras.
- Desactivar un usuario, o cambiarle rol o contraseña, revoca sus sesiones.
- En el teléfono, el refresh token va en el llavero (SecureStore) y el access token solo en memoria.

**Autorización**
- RBAC con una matriz de permisos compartida entre API y app. Todas las rutas `/api` exigen token; las desconocidas responden 401 sin revelar si existen.
- Un administrador no puede desactivarse ni quitarse el rol. Siempre queda al menos un administrador activo (transacción `Serializable`).
- Dar de baja herramientas y corregir datos financieros: solo ADMIN.
- Quien no gestiona usuarios solo ve nombre y rol, sin correos.

**Integridad de datos y trazabilidad**
- Estado y ubicación de una herramienta son derivados. Solo cambian dentro de la transacción que inserta el evento. `PATCH` descarta los campos no permitidos (no hay asignación masiva).
- `lifecycle_events` es de solo inserción: un trigger bloquea UPDATE y DELETE incluso con acceso directo a la BD.
- Restricciones CHECK duplican en la BD las reglas críticas: origen distinto del destino, entrega distinta de recepción, montos no negativos.
- Las herramientas de un traslado se bloquean con `SELECT … FOR UPDATE`. Dos traslados simultáneos de la misma herramienta: exactamente uno gana.
- Un traslado es todo o nada: si una herramienta es inválida, no se mueve ninguna.
- Regla cronológica: no se aceptan movimientos con fecha anterior al último registrado ni a la compra.

**Inyección y validación**
- Toda entrada pasa por Zod. Las consultas usan Prisma o `$queryRaw` con parámetros; `Prisma.raw` solo recibe literales internos.
- Límite de 100 KB para JSON. Los errores nunca exponen trazas ni mensajes de Prisma.

**Archivos**
- Se valida por magic bytes (JPEG, PNG o WEBP). SVG, HTML, GIF y otros formatos se rechazan.
- Límite de píxeles contra bombas de descompresión. Toda imagen se re-codifica a JPEG sin EXIF (GPS, dispositivo).
- La clave en el almacenamiento la genera el servidor (UUID); nunca deriva del nombre del archivo.
- Bucket privado, lectura solo con URLs firmadas de 10 min. Las fotos sin asociar solo las ve quien las subió y se purgan a las 24 h.
- Límites: 15 MB por foto, 5 por petición, 60 subidas por usuario cada 15 min.

**Infraestructura**
- Helmet (HSTS, nosniff, etc.) y sin `x-powered-by`. Los logs ocultan `Authorization`, contraseñas y tokens.
- Los secretos JWT requieren al menos 32 caracteres. La configuración inválida detiene el arranque sin imprimir valores.

## Riesgos aceptados y recomendaciones

1. **Ventana de 15 min tras desactivar un usuario.** Su access token sigue siendo válido hasta expirar. Si no es aceptable: verificar `active` en `authenticate` con una caché de unos 60 s.
2. **La cadena de custodia confía en quien registra.** Un supervisor puede indicar que otra persona recibió. Recomendado para la siguiente iteración: confirmación del receptor desde su sesión o con PIN, con estado "pendiente de recepción".
3. **Memoria en subidas.** multer usa memoria: 5 × 15 MB por petición. Con mucha concurrencia, conviene poner un límite de tamaño de cuerpo en el proxy (por ejemplo `client_max_body_size 80m`) y escalar en horizontal.
4. **HTTPS obligatorio en producción**, terminado en el proxy o balanceador. La app móvil debe usar `https://` en `EXPO_PUBLIC_API_URL`.
5. **Bloqueo por correo:** un atacante puede bloquear el login de una víctima durante 15 min. Es una contrapartida aceptada a cambio de frenar la fuerza bruta.
6. **Dependencias:** CI ejecuta `pnpm audit --prod`. Hace falta commitear el lockfile tras el primer `pnpm install`.

## Cómo verificar

```bash
pnpm install
pnpm --filter @tt/shared build
pnpm --filter @tt/api exec prisma generate
pnpm test        # unitarias
pnpm test:int    # levanta postgres-test (puerto 5433) y corre las de integración
```
