# Plataforma multi-tenant (SaaS)

Varias empresas usan la misma instalación con sus datos aislados. Este documento cubre la
arquitectura, los roles, el aislamiento, la migración de los datos existentes, las sesiones de
soporte, la auditoría, los tableros y las reglas de los valores financieros.

## 1. Arquitectura

**Base de datos compartida con aislamiento por `organization_id`.** Se eligió frente a una base o
un esquema por empresa porque el modelo ya era relacional y homogéneo (11 tablas de negocio), el
volumen es pequeño y así hay una sola migración, un solo respaldo y un solo despliegue.

El aislamiento tiene **tres capas independientes** (si una falla, las otras lo detienen):

| Capa | Dónde | Qué hace |
|---|---|---|
| 1. Contexto de la petición | `middleware/auth.ts`, `lib/context.ts` | La organización sale **del token**, nunca del cliente. Se guarda en un `AsyncLocalStorage` para toda la petición. |
| 2. Cliente Prisma con filtro | `lib/tenant-prisma.ts` | Agrega `organizationId` a toda consulta (lectura, conteo, actualización, borrado) y a toda alta de los modelos de una organización. **Falla cerrado**: sin contexto, error; SuperAdmin sin organización elegida, `400 ORG_REQUIRED`. Un id de otra organización responde **404** (no revela que existe). |
| 3. Base de datos | migración `3_multi_tenant` | Triggers `tenant_guard` impiden relacionar registros de dos organizaciones (herramienta de A en traslado de B, categoría de B en herramienta de A…) y que un registro cambie de organización. `CHECK`: solo el SuperAdmin existe sin organización. |

Las consultas SQL escritas a mano (reportes, bloqueos `FOR UPDATE`) no pasan por la capa 2: usan
`requireOrgId()` explícitamente. Las rutas de plataforma usan el cliente **sin** filtro, a propósito
y solo detrás de `requireSuperadmin`.

En la app, cada contexto (plataforma, una organización elegida por el SuperAdmin, una sesión de
soporte) tiene **su propia caché de datos y su propio árbol de pantallas**: al cambiar de contexto
todo se monta de cero, y las consultas de plataforma o de organización solo salen si el contexto
lo permite. Ningún dato de una organización se muestra en otra, ni siquiera por un instante.

### Modelos por organización

`users` (salvo el SuperAdmin), `locations`, `vehicles`, `tool_categories`, `tools`, `transfers`,
`lifecycle_events`, `damage_reports`, `rentals`, `photos`. `transfer_items` hereda la de su traslado
(trigger). `audit_log` e `impersonation_sessions` llevan la organización en que ocurrió la acción.

Únicos **por organización**: código de herramienta, nombre de categoría, nombre+tipo de ubicación,
placa. El **usuario y el correo siguen siendo únicos en toda la plataforma** (se inicia sesión sin
elegir empresa).

## 2. Organización (tenant)

Tabla `organizations`: nombre, identificador corto (`slug`), estado (`active`), razón social,
identificación fiscal, contacto, dirección, **moneda** (ISO 4217, con la que la app muestra los
montos) y color de marca. No tiene facturación ni suscripciones.

- Al crearla nace con las 31 categorías comunes, una "Bodega principal" y, opcionalmente, su primer
  administrador (que debe cambiar la contraseña al entrar).
- **No se borra**: se desactiva. Desactivada, sus usuarios no pueden entrar, sus tokens vigentes
  dejan de funcionar (la API lo comprueba con una caché de 30 s), se cierran sus sesiones y las de
  soporte abiertas hacia ella. Su información se conserva.

## 3. Jerarquía de roles y matriz de permisos

| Rol | Organización | Descripción |
|---|---|---|
| **SUPERADMIN** | ninguna | Plataforma completa: organizaciones, usuarios de todas, auditoría global, sesiones de soporte y, eligiendo una organización, toda la operación de esa empresa. |
| **ADMIN** (UsuarioAdministrador) | una | Todo lo de su organización: herramientas, catálogos, usuarios, valores financieros, reportes, auditoría. |
| BODEGUERO, SUPERVISOR, CHOFER, LECTOR | una | Sin cambios respecto a antes, ahora limitados a su organización. |

| Permiso | SUPERADMIN | ADMIN | BODEGUERO | SUPERVISOR | CHOFER | LECTOR |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| tools:read | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| tools:write | ✔ | ✔ | ✔ | | | |
| tools:financial (corregir precio/fecha) | ✔ | ✔ | | | | |
| **finance:read (ver montos)** | ✔ | ✔ | | | | |
| transfers:read · transfers:create · transfers:receive | ✔ | ✔ | ✔ | ✔ | ✔ | read |
| transfers:override | ✔ | ✔ | ✔ | | | |
| lifecycle:create | ✔ | ✔ | ✔ | ✔ | | |
| lifecycle:decommission | ✔ | ✔ | | | | |
| catalog:write | ✔ | ✔ | ✔ | | | |
| reports:read | ✔ | ✔ | ✔ | ✔ | | ✔ |
| users:read | ✔ | ✔ | ✔ | ✔ | ✔ | |
| users:manage | ✔ | ✔ | | | | |
| audit:read (su organización) | ✔ | ✔ | | | | |
| platform:organizations · platform:users · platform:audit · platform:impersonate | ✔ | | | | | |

**Valores monetarios** (decisión del dueño): solo ADMIN y SUPERADMIN. Al resto la API **no envía**
`purchasePrice` ni los `cost` del historial, los reportes de dinero responden 403, el resumen trae
los montos en `null` y el Excel sale con las columnas de dinero vacías. El Bodeguero sigue
escribiendo el precio al dar de alta una herramienta, pero no lo vuelve a ver.

Reglas reforzadas:

- Un ADMIN no puede crear ni modificar SuperAdmins, ni elegir otra organización (`X-Org-Id` de otra
  → 403 auditado), ni cambiar su organización (el campo se ignora), ni cambiar su propio rol,
  desactivarse o bloquearse. Siempre debe quedar un ADMIN activo en cada organización.
- Crear un SuperAdmin, desactivarlo o restablecer su contraseña exige la **contraseña de quien
  opera**. Nunca puede quedar la plataforma sin un SuperAdmin activo. Un SuperAdmin no se elimina.
- Ningún flujo de la API convierte un usuario de organización en SuperAdmin (ni al revés): un
  SuperAdmin nuevo es siempre una cuenta nueva.
- Recuperación de acceso del SuperAdmin: solo desde el servidor (`pnpm superadmin reset`).

## 4. Contexto de organización del SuperAdmin

El SuperAdmin no pertenece a ninguna organización. Para operar dentro de una la app envía la
cabecera `X-Org-Id`; la API comprueba que exista y ejecuta la petición en esa organización. Cada
acción queda auditada con esa organización. Sin cabecera, solo puede usar `/api/platform/*`.

## 5. Sesiones de soporte (impersonación)

`POST /api/platform/impersonations { userId, reason }` (solo SuperAdmin, desde su propia sesión):

- Crea una fila en `impersonation_sessions` (actor, usuario, organización, motivo, inicio,
  vencimiento) y devuelve **un access token de 30 min, sin refresh token**, con `sub` = usuario
  impersonado y los claims `act` (SuperAdmin) e `imp` (sesión).
- La API valida la sesión **en cada petición**: finalizarla o revocarla corta el acceso al instante.
- No usa, no muestra y no cambia la contraseña del usuario. Tampoco hereda su "debe cambiar clave".
- Se aplican **los permisos del usuario impersonado** y solo su organización.
- No hay cadenas: el token impersonado nunca es SUPERADMIN, así que no puede abrir otra sesión. No se
  puede impersonar a otro SuperAdmin, a cuentas inactivas ni a organizaciones desactivadas. Una
  sesión nueva cierra la anterior del mismo SuperAdmin.
- **Bloqueado durante la sesión:** crear, editar, bloquear, eliminar usuarios, restablecer
  credenciales, revocar sesiones y cambiar la propia contraseña (`403 IMPERSONATION_FORBIDDEN`).
- Fin: `POST /api/auth/impersonation/end` (desde la sesión) o `POST /api/platform/impersonations/:id/revoke`.
- En la app: franja fija "Sesión de soporte — Accediendo como [usuario]" con **Finalizar
  impersonación**; al terminar o vencer se vuelve a la sesión del SuperAdmin.

**Atribución:** cada fila de auditoría guarda `actor_id` = SuperAdmin (actor real),
`effective_user_id` = usuario impersonado e `impersonation_id`. Los registros de negocio
(`reported_by`, `uploaded_by`…) llevan al usuario efectivo, porque las reglas de dominio dependen
de él; la auditoría vincula cada uno con quién lo hizo realmente.

## 6. Auditoría

`audit_log` es ahora de **solo inserción** (trigger). Cada fila: actor real, usuario efectivo,
organización, sesión de soporte, acción, recurso e id, **resultado** (`SUCCESS`, `FAILURE`,
`DENIED`), diferencias (sin contraseñas, hashes, tokens ni PIN), IP y navegador/dispositivo.

Eventos: inicio y cierre de sesión (y fallidos), bloqueos, cambio de contraseña, altas y cambios de
usuarios, restablecimientos, revocación de sesiones, herramientas, traslados, eventos, daños,
alquileres, fotos, catálogos, organizaciones, sesiones de soporte y **todo acceso denegado (403)**
de un usuario autenticado (`access.denied`, con método y ruta).

Consulta: `GET /api/audit` (su organización, `audit:read`) y `GET /api/platform/audit` (todas),
con filtros `organizationId` (solo global), `userId` (real o efectivo), `action`, `module`
(prefijo: `tool`, `user`, `auth`, `impersonation`…), `result`, `from`, `to`.

## 7. Tablero de la organización (interactivo)

Cada cifra y cada elemento de gráfica abre **la lista exacta de registros que la forman**
(pantalla `Detalle`, con título, periodo, cantidad, suma, búsqueda, filtro por estado y enlace a
cada herramienta). La API calcula el total y el detalle con **los mismos fragmentos SQL**
(`reports.service.ts`), y las pruebas comparan uno con otro en cada barra, categoría, estado y
ubicación.

| Elemento | Abre |
|---|---|
| Valor del inventario | herramientas que siguen en uso o recuperables |
| Compras del periodo | herramientas propias compradas en el periodo |
| Dañadas / Extraviadas | herramientas en ese estado hoy |
| Disponibles en bodega / En uso en proyectos | herramientas en ese estado |
| Anillo "Por estado" (segmento o leyenda) | herramientas en ese estado |
| Anillo "Por proyecto" · Top 5 proyectos | herramientas en esa ubicación |
| Barra de "Gasto en el tiempo" → Ver compras / Ver mantenimiento | compras o gastos de ese mes/año |
| Barra de "Compras por categoría" | compras de esa categoría en el periodo |
| Reportes: tarjetas, gasto mensual, pérdidas por periodo, compras por tipo, control de pérdidas | lo mismo, con su definición |

Filtros del tablero: periodo (12 meses, año en curso, 5 años), categoría y ubicación actual. Se
aplican a los totales y viajan al detalle. Endpoint: `GET /api/reports/details?metric=tools|inventory|purchases|maintenance|losses`
con `status`, `categoryId`, `locationId`, `from`, `to`, `period` + `granularity`, `q`, paginación.

## 8. Valores financieros

**Verificación del supuesto error.** Antes de cambiar nada se comprobó cómo se calculaba:

- La API **no sumaba** el valor de lo comprado con el de lo dañado: `inventario + pérdidas = compras`
  (cada herramienta está en uno solo de los dos lados). Lo confirma la prueba
  `dashboard.int.test.ts › compradas y dañadas son indicadores separados`.
- Lo que sí mezclaba conceptos era la **presentación**: un único indicador "Pérdidas" que juntaba
  dañadas (reparables) con extraviadas y bajas, valoradas a precio de compra como si fuera una
  pérdida; y la barra "Gasto por categoría" que sumaba compras + mantenimiento.
- Además, las **herramientas rentadas** (precio 0) contaban como "compradas" en los conteos.

**Cambios:** indicadores separados e independientes (inventario en uso, compras del periodo,
dañadas hoy, extraviadas hoy, dadas de baja, mantenimiento), ninguno se suma con otro; "Compras por
categoría" muestra solo compras (mantenimiento aparte); las rentadas no cuentan como compras.

**Datos disponibles:** solo precio de compra (`tools.purchase_price`) y costos registrados en
eventos de mantenimiento/daño (`lifecycle_events.cost`). No hay valor actual, de reposición,
depreciación ni pérdida estimada. Por eso "Dañadas" y "Extraviadas" se rotulan siempre como
**valor de adquisición**, nunca como pérdida económica real. En el listado, una herramienta propia
sin precio muestra "Valor no registrado" y una rentada "Rentada · sin valor de compra".

## 9. Tablero global del SuperAdmin

Indicadores: organizaciones (activas/total), usuarios con acceso (activos y SuperAdmins),
herramientas y actividad auditada de 30 días. Gráficas por empresa: herramientas, dañadas (con su
valor de adquisición), valor de compras, actividad, y la tabla de distribución por estado.
**Tocar una empresa entra a esa organización** y abre solo sus datos (con la franja "Operando en …").
Los montos de empresas con monedas distintas no se consolidan ni se comparan en una escala.

## 10. Migración de los datos existentes (`3_multi_tenant`)

1. **Tablas afectadas:** las 10 de negocio + `audit_log` (columnas nuevas), `organizations` e
   `impersonation_sessions` (nuevas). `transfer_items` y `refresh_tokens` no cambian.
2. **Registros históricos:** todo lo existente se creó cuando el sistema era de una sola empresa.
3. **Asignación:** confirmada por el dueño: **todo a una organización, "Ingenieria H"**
   (`ingenieria-h`), incluida la auditoría previa. En una base nueva (sin usuarios ni datos) no se
   crea ninguna y se quitan solo las categorías sembradas sin uso; cada organización trae las suyas.
4. **Respaldo previo:** el despliegue (`deploy/servidor/activar-release.sh`) ya hace un `pg_dump`
   verificado antes de migrar. Para comparar: `apps/api/prisma/ops/counts.sql` antes y después.
5. **Migración compatible y no destructiva:** columnas nuevas primero opcionales → asignación →
   obligatorias. No borra ni modifica datos de negocio. Las protecciones de solo inserción se
   suspenden **solo** para asignar la organización, dentro de la misma transacción.
6. **Verificaciones de integridad:** la propia migración falla si queda un usuario sin organización
   o una relación cruzada; después, `apps/api/prisma/ops/verify-tenancy.sql` (todas las filas en 0).
7. **Reversión:** `apps/api/prisma/ops/rollback-3_multi_tenant.sql` (solo con UNA organización; con
   más, restaurar el respaldo). Ver el encabezado del script.

Prisma aplica el archivo en **una sola transacción**: se comprobó que un fallo no deja cambios a medias.

**Ensayo realizado** (copia de la base local de desarrollo en la base de pruebas): migrar → conteos
idénticos → `verify-tenancy.sql` sin problemas → revertir → conteos idénticos → volver a aplicar →
conteos idénticos. Después se migró la base local de desarrollo (con respaldo previo).

## 11. Pruebas

| Suite | Cubre |
|---|---|
| `tests/integration/tenancy.int.test.ts` | Empresa A y Empresa B con los mismos nombres y códigos: listados, detalle por id y por QR, catálogos, relaciones cruzadas, usuarios, reportes, Excel, fotos, auditoría, `X-Org-Id` ajeno, triggers de la BD, organización desactivada, conservación del historial. |
| `tests/integration/platform.int.test.ts` | SuperAdmin: organizaciones, tablero global, contexto `X-Org-Id`, alta con primer administrador y cambio obligatorio, usuarios de toda la plataforma, restablecimiento y revocación, controles reforzados, último SuperAdmin, sin escalamiento, auditoría global con filtros. Sesiones de soporte: permisos efectivos, auditoría con actor real, operaciones bloqueadas, fin, revocación, vencimiento, sin cadenas. |
| `tests/integration/dashboard.int.test.ts` | Valores separados sin duplicar; cada estado, ubicación, barra (mensual y anual), categoría e indicador coincide con su detalle; filtros; paginación y búsqueda; precio visible solo con permiso. |
| `src/lib/tenant-prisma.test.ts`, `src/middleware/auth.test.ts`, `token.service.test.ts` | Filtro automático y falla cerrada, cabecera de organización, organización desactivada, cambio obligatorio, sesión de soporte revocada, claims del token. |

Se verificó además que las pruebas **detectan una fuga**: con el filtro automático desactivado,
7 de las 13 de aislamiento fallan (las otras 6 las sostienen las capas 1 y 3).

## 12. Riesgos pendientes

1. **Matriz de permisos fija por rol.** El administrador asigna roles, pero no edita permisos sueltos
   por organización. Si se necesita, hace falta una tabla de permisos por organización y rol.
2. **Usuario/correo únicos en toda la plataforma.** Dos empresas no pueden tener el mismo nombre de
   usuario. Es lo que permite entrar sin elegir empresa; cambiarlo exigiría elegir la organización
   al iniciar sesión.
3. **Ventana de hasta 15 min** tras desactivar a un usuario (su access token sigue vigente), igual
   que antes. La desactivación de una organización sí se aplica en ≤ 30 s.
4. **Caché del estado de la organización por proceso** (30 s). Con varios procesos de la API, cada
   uno tarda como máximo eso en ver una desactivación.
5. **Sesiones de soporte y recarga de la app:** si se recarga la app durante una sesión de soporte,
   se vuelve a la sesión del SuperAdmin y la de soporte queda abierta hasta vencer (≤ 30 min) o
   hasta revocarla desde la plataforma.
6. **Fotos:** las claves de almacenamiento no llevan la organización (no hace falta: solo se
   obtienen con URL firmada pedida por la API, que filtra por organización).
7. **Auditoría de solo inserción:** eliminar un usuario con historial es imposible por diseño
   (se desactiva). Un usuario sin historial sí se puede eliminar.

## 13. Despliegue

Ver `docs/DEPLOY.md` › *Actualización a multi-tenant*.
