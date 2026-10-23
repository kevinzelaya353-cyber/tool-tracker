# Graph Report - tool-tracker  (2026-10-23)

## Corpus Check
- 229 files · ~258,130 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 4, .example 4, .conf 3)

## Summary
- 1910 nodes · 5868 edges · 80 communities (71 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 121 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `06ccf73c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lib/api.ts
- reports.routes.ts
- helpers.ts
- schemas.ts
- react
- platform.routes.ts
- AppError
- (tabs)/index.tsx
- scripts
- auth.service.ts
- useTheme
- tools.routes.ts
- theme.ts
- Tool Tracker
- app/_layout.tsx
- dependencies
- 2_danos_alquileres/migration.sql
- api/package.json
- server.ts
- app.ts
- shared/package.json
- mobile/package.json
- expo
- PhotoPicker.tsx
- catalogRouter
- dependencies
- image.ts
- requireOrgId
- enums.ts
- useAuth
- LocationPicker.tsx
- compilerOptions
- devDependencies
- scripts
- users/api.ts
- state-machine.ts
- transfers.service.ts
- Card
- api/tsconfig.json
- mobile/tsconfig.json
- reports.ts
- shared/tsconfig.json
- metro.config.js
- scripts
- export.service.ts
- devDependencies
- schemas.test.ts
- entorno.sh
- transfer/new.tsx
- 3_multi_tenant/migration.sql
- rentals/api.ts
- types/api.ts
- 0_init/migration.sql
- tools/api.ts
- ToolQrCard.tsx
- transfers/api.ts
- Despliegue (GitHub Actions → VPS)
- "tools"
- Plataforma multi-tenant (SaaS)
- local-storage.ts
- static-map.ts
- organizations.service.ts
- rules.ts
- platform/api.ts
- audit.tsx
- "users"
- Revisión de seguridad: fase 7
- permissions.ts
- audit
- scan.tsx
- Tool Tracker: guía para Claude Code
- noNul
- assets.d.ts
- Props

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 139 edges
2. `react-native` - 73 edges
3. `useAuth()` - 72 edges
4. `ErrorBanner()` - 69 edges
5. `Button()` - 64 edges
6. `react` - 60 edges
7. `Card()` - 58 edges
8. `space` - 58 edges
9. `audit()` - 55 edges
10. `Loading()` - 55 edges

## Surprising Connections (you probably didn't know these)
- `Fase multi-tenant (SaaS)` --references--> `requireOrgId()`  [INFERRED]
  SECURITY.md → apps/api/src/lib/context.ts
- `Riesgos aceptados y recomendaciones` --references--> `authenticate()`  [INFERRED]
  SECURITY.md → apps/api/src/middleware/auth.ts
- `Hallazgos corregidos en esta fase` --references--> `redact()`  [INFERRED]
  SECURITY.md → apps/api/src/lib/audit.ts
- `Tool Tracker: guía para Claude Code` --references--> `requireOrgId()`  [INFERRED]
  CLAUDE.md → apps/api/src/lib/context.ts
- `1. Arquitectura` --references--> `requireOrgId()`  [INFERRED]
  docs/MULTI_TENANT.md → apps/api/src/lib/context.ts

## Import Cycles
- None detected.

## Communities (80 total, 9 thin omitted)

### Community 0 - "lib/api.ts"
Cohesion: 0.18
Nodes (11): ApiError, BASE_URL, Query, refresh(), request(), RequestOptions, session, TokenPair (+3 more)

### Community 1 - "reports.routes.ts"
Cohesion: 0.08
Nodes (13): defaultSeriesRange(), fillByStatus(), isValidTimeZone(), LOSS_STATUS_LIST, MAINTENANCE_COST_EVENTS, overTimeQuery, scope, Bucket (+5 more)

### Community 2 - "helpers.ts"
Cohesion: 0.08
Nodes (42): flip(), LatLng, Route, routeProvider, RoutingConfig, simplify(), A, B (+34 more)

### Community 3 - "schemas.ts"
Cohesion: 0.02
Nodes (81): AUDIT_RESULT, AuditQuery, auditQuerySchema, AuditResult, CatalogListQuery, catalogListQuerySchema, CategoryCreateInput, categoryCreateSchema (+73 more)

### Community 4 - "react"
Cohesion: 0.10
Nodes (28): NewDamageReportScreen(), COST_EVENTS, HINT, styles, NewRentalScreen(), styles, Check, useStyles (+20 more)

### Community 5 - "platform.routes.ts"
Cohesion: 0.06
Nodes (34): createApp(), authorize(), authorizeAny(), canSeeValues(), currentUser(), ORG_HEADER, PASSWORD_CHANGE_PATHS, Part (+26 more)

### Community 6 - "AppError"
Cohesion: 0.07
Nodes (27): currentContext(), RequestContext, runAsPlatform(), runWithContext(), store, AppError, crossTenant(), Data (+19 more)

### Community 7 - "(tabs)/index.tsx"
Cohesion: 0.06
Nodes (66): Dashboard(), Home(), Panel(), pct(), pctText(), PendingCard(), PRESETS, ProjectRow (+58 more)

### Community 8 - "scripts"
Cohesion: 0.06
Nodes (34): ignoreCves, devDependencies, eslint, @eslint/js, prettier, typescript, typescript-eslint, engines (+26 more)

### Community 9 - "auth.service.ts"
Cohesion: 0.06
Nodes (25): forbidDuringImpersonation(), authRouter(), loginAccountLimiter(), loginLimiter(), passThrough(), refreshLimiter(), ARGON2_OPTIONS, AuthService (+17 more)

### Community 10 - "useTheme"
Cohesion: 0.13
Nodes (28): RentalsScreen(), useStyles, METRIC_COPY, Params, ReportDetailScreen(), Row(), useStyles, Fact() (+20 more)

### Community 11 - "tools.routes.ts"
Cohesion: 0.10
Nodes (13): Page, pageArgs(), toPage(), codeParams, idParams, toolsRouter(), withoutCost(), withoutPrice() (+5 more)

### Community 12 - "theme.ts"
Cohesion: 0.09
Nodes (49): LocationsScreen(), useStyles, OrganizationsScreen(), useStyles, Badge(), PlatformUsersScreen(), Status, STATUS_LABEL (+41 more)

### Community 13 - "Tool Tracker"
Cohesion: 0.22
Nodes (9): API (todas bajo `/api`, con `Authorization: Bearer` salvo auth), App móvil, Flujo de fotos, Primer arranque (sin Docker), Pruebas, Reglas de dominio, Reportes financieros, Requisitos (+1 more)

### Community 14 - "app/_layout.tsx"
Cohesion: 0.05
Nodes (43): AppLayout(), BackButton(), ErrorBoundary(), goHome(), HomeButton(), HeaderLogo(), icon(), IconName (+35 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, expo, expo-camera, expo-constants, expo-crypto, expo-file-system, expo-image-manipulator, expo-image-picker (+24 more)

### Community 16 - "2_danos_alquileres/migration.sql"
Cohesion: 0.12
Nodes (25): "photos", photos_lifecycle_event_id_idx, photos_storage_key_key, photos_tool_id_idx, photos_transfer_id_idx, "damage_reports", damage_reports_immutable, damage_reports_lifecycle_event_id_key (+17 more)

### Community 17 - "api/package.json"
Cohesion: 0.10
Nodes (20): @tt/shared, typescript, vitest, zod, name, private, type, version (+12 more)

### Community 18 - "server.ts"
Cohesion: 0.14
Nodes (12): prisma, s3Storage(), S3StorageConfig, osmTileFetcher(), app, env, media, routing (+4 more)

### Community 19 - "app.ts"
Cohesion: 0.05
Nodes (39): prisma, prisma, AppEnv, app, Env, envSchema, loadEnv(), optionalUrl (+31 more)

### Community 20 - "shared/package.json"
Cohesion: 0.10
Nodes (20): dependencies, zod, devDependencies, typescript, vitest, exports, files, typescript (+12 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.09
Nodes (21): @tt/shared, typescript, zod, main, name, private, version, expo-camera (+13 more)

### Community 22 - "expo"
Cohesion: 0.07
Nodes (29): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, versionCode, projectId, typedRoutes (+21 more)

### Community 23 - "PhotoPicker.tsx"
Cohesion: 0.15
Nodes (21): Props, ToolCoverPhoto(), useStyles, ModalSafeArea(), compressImage(), MultiPhotoCapture(), Props, useStyles (+13 more)

### Community 25 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, argon2, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, cors, exceljs, express, express-rate-limit (+10 more)

### Community 26 - "image.ts"
Cohesion: 0.26
Nodes (9): detectImageType(), IMAGE_LIMITS, ImageKind, ImageLimits, invalid(), PNG_SIGNATURE, ProcessedImage, processImage() (+1 more)

### Community 27 - "requireOrgId"
Cohesion: 0.17
Nodes (8): orgRequired(), requireOrgId(), attachPhotos(), lockTools(), DamageService, RentalsService, transfersRouter(), TransfersService

### Community 28 - "enums.ts"
Cohesion: 0.06
Nodes (33): DAMAGE_KIND, DAMAGE_KIND_LABEL, DAMAGE_MAX_PHOTOS, DamageKind, DEFAULT_CATEGORIES, EVENT_TYPE, ITEM_OUTCOME, ITEM_OUTCOME_LABEL (+25 more)

### Community 29 - "useAuth"
Cohesion: 0.11
Nodes (50): ChangePasswordScreen(), NewEventScreen(), NewLocationScreen(), EMPTY, Form, OrganizationScreen(), styles, AccountScreen() (+42 more)

### Community 30 - "LocationPicker.tsx"
Cohesion: 0.13
Nodes (22): DEFAULT_CENTER, LatLng, leafletHtml(), LeafletOptions, MapMarker, LeafletView(), LeafletViewProps, styles (+14 more)

### Community 31 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule (+4 more)

### Community 32 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, supertest, tsx, @types/cors, @types/express, @types/multer, @types/node, @types/supertest (+2 more)

### Community 33 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, build, dev, prisma:generate, prisma:migrate, prisma:seed, prisma:validate, start (+4 more)

### Community 34 - "users/api.ts"
Cohesion: 0.31
Nodes (9): catalogKeys, keys, useAccountStatus(), useCreateUser(), useDeleteUser(), useInvalidate(), useResetPassword(), useRevokeSessions() (+1 more)

### Community 35 - "state-machine.ts"
Cohesion: 0.24
Nodes (10): LocationType, availableEvents(), canReportDamage(), DAMAGE_REPORTABLE, EVENT_REQUIRES_LOCATION, isTerminal(), resolveTransition(), Transition (+2 more)

### Community 36 - "transfers.service.ts"
Cohesion: 0.10
Nodes (8): MediaService, ObjectStorage, TileFetcher, idParams, ActorCtx, Ctx, DETAIL_INCLUDE, purgeTimer

### Community 37 - "Card"
Cohesion: 0.15
Nodes (26): Condition(), Icon, Middle, RentalDetailScreen(), Step(), useStyles, ReturnRentalScreen(), AddPhotos() (+18 more)

### Community 38 - "api/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, exclude, extends, include, ../../tsconfig.base.json

### Community 39 - "mobile/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noUncheckedIndexedAccess, paths, strict, extends, include, expo/tsconfig.base

### Community 40 - "reports.ts"
Cohesion: 0.17
Nodes (14): EventType, ToolStatus, CategorySpendRow, CountValue, LossReport, LossRow, OrganizationSummary, PlatformOrgStats (+6 more)

### Community 41 - "shared/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, exclude, extends, include, ../../tsconfig.base.json

### Community 42 - "metro.config.js"
Cohesion: 0.29
Nodes (5): config, { getDefaultConfig }, path, workspaceRoot, expo

### Community 43 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, android, eas-build-post-install, ios, start, test, typecheck, web

### Community 44 - "export.service.ts"
Cohesion: 0.07
Nodes (40): transfer(), distanceM(), GeoPhoto, photoDistances(), Point, bitacoraEntries(), COLUMNS, CURRENCY_SYMBOL (+32 more)

### Community 45 - "devDependencies"
Cohesion: 0.50
Nodes (4): devDependencies, @types/qrcode, @types/react, typescript

### Community 46 - "schemas.test.ts"
Cohesion: 0.15
Nodes (12): credentialSchemaFor(), damageReportCreateSchema, isRunOrRepeat(), money, pinSchema, platformUserCreateSchema, rentalCreateSchema, rentalReturnSchema (+4 more)

### Community 47 - "entorno.sh"
Cohesion: 0.15
Nodes (18): cwd_pm2(), fallar(), log(), pid_de(), prisma(), recargar(), responde(), sana() (+10 more)

### Community 48 - "transfer/new.tsx"
Cohesion: 0.14
Nodes (27): ToolsScreen(), useStyles, NewTransferScreen(), STEPS, useStyles, ToolCard(), toolValue(), useStyles (+19 more)

### Community 49 - "3_multi_tenant/migration.sql"
Cohesion: 0.13
Nodes (26): "audit_log", audit_log_at_idx, audit_log_entity_entity_id_idx, audit_log_actor_id_at_idx, audit_log_immutable, audit_log_impersonation_id_idx, audit_log_organization_id_at_idx, damage_reports_tenant (+18 more)

### Community 50 - "rentals/api.ts"
Cohesion: 0.19
Nodes (9): invalidate(), rentalKeys, RentalPayload, RentalReturnPayload, useCreateRental(), useRentalsInfinite(), useReturnRental(), RentalDetail (+1 more)

### Community 51 - "types/api.ts"
Cohesion: 0.14
Nodes (16): AuditFilters, useAudit(), AccountStatus, AuditEntry, Category, Location, ManagedUser, MapPlace (+8 more)

### Community 52 - "0_init/migration.sql"
Cohesion: 0.16
Nodes (21): "lifecycle_events", lifecycle_events_immutable, lifecycle_events_tool_id_occurred_at_idx, lifecycle_events_type_occurred_at_idx, "locations", locations_name_type_key, "refresh_tokens", refresh_tokens_family_idx (+13 more)

### Community 53 - "tools/api.ts"
Cohesion: 0.13
Nodes (15): Props, damageKeys, DamagePayload, LifecyclePayload, CategoryCount, fetchAllTools(), ToolFilters, toolKeys (+7 more)

### Community 54 - "ToolQrCard.tsx"
Cohesion: 0.28
Nodes (10): escapeHtml(), labelsHtml(), QrLabel, qrPath(), qrSvg(), styles, ToolQrCard(), printHtml() (+2 more)

### Community 55 - "transfers/api.ts"
Cohesion: 0.14
Nodes (11): PendingFilter, ReceivePayload, transferKeys, TransferPayload, useAddTransferPhotos(), useCreateTransfer(), useReceiveTransfer(), useTransferMap() (+3 more)

### Community 56 - "Despliegue (GitHub Actions → VPS)"
Cohesion: 0.18
Nodes (10): Acceso a development (no público), Actualización a multi-tenant (migración `3_multi_tenant`), Configurar GitHub (una vez, lo hace el dueño del repositorio), Despliegue (GitHub Actions → VPS), Estado del servidor (ya preparado), Flujo de trabajo, Operación (como `tooltracker`: `sudo -iu tooltracker`), Primer despliegue de cada entorno (+2 more)

### Community 57 - ""tools""
Cohesion: 0.12
Nodes (16): "tool_categories", tool_categories_name_key, "tools", tools_category_id_idx, tools_code_key, tools_cover_photo_id_key, tools_current_location_id_idx, tools_purchase_date_idx (+8 more)

### Community 58 - "Plataforma multi-tenant (SaaS)"
Cohesion: 0.12
Nodes (16): tool(), 10. Migración de los datos existentes (`3_multi_tenant`), 11. Pruebas, 12. Riesgos pendientes, 13. Despliegue, 1. Arquitectura, 2. Organización (tenant), 3. Jerarquía de roles y matriz de permisos (+8 more)

### Community 59 - "local-storage.ts"
Cohesion: 0.33
Nodes (5): localFilesRouter(), localStorage(), LocalStorageConfig, resolveKey(), sign()

### Community 60 - "static-map.ts"
Cohesion: 0.31
Nodes (8): fitZoom(), LatLng, project(), renderStaticMap(), StaticMapInput, COMAYAGUA, TEGUS, sharp

### Community 61 - "organizations.service.ts"
Cohesion: 0.15
Nodes (5): ORG_FIELDS, OrganizationsService, slugify(), OverviewService, PlatformDeps

### Community 62 - "rules.ts"
Cohesion: 0.24
Nodes (10): checkDamageReport(), checkLifecycleEvent(), checkRentalEvent(), checkTransfer(), chronology(), COST_EVENTS, DamageCheck, LifecycleCheck (+2 more)

### Community 63 - "platform/api.ts"
Cohesion: 0.24
Nodes (12): usePlatformAccess(), platformKeys, useCreatePlatformUser(), useOrganization(), usePlatformUser(), usePlatformUsers(), useRefreshPlatform(), useResetPlatformPassword() (+4 more)

### Community 64 - "audit.tsx"
Cohesion: 0.20
Nodes (9): AuditRow(), MODULES, RESULT_LABEL, Since, SINCE_DAYS, SINCE_LABEL, useStyles, Props (+1 more)

### Community 65 - ""users""
Cohesion: 0.25
Nodes (9): "users", users_email_key, users_username_key, "vehicles", vehicles_plate_key, "organizations", organizations_slug_key, users_organization_id_idx (+1 more)

### Community 66 - "Revisión de seguridad: fase 7"
Cohesion: 0.22
Nodes (7): FakeDecimal, Controles verificados, Cómo verificar, Fase multi-tenant (SaaS), Hallazgos corregidos en esta fase, Revisión de seguridad: fase 7, Riesgos aceptados y recomendaciones

### Community 67 - "permissions.ts"
Cohesion: 0.36
Nodes (7): Role, TENANT_ROLE, can(), Permission, PLATFORM_PERMISSION, ROLE_PERMISSIONS, TENANT_PERMISSION

### Community 69 - "audit"
Cohesion: 0.09
Nodes (19): audit(), runInOrg(), hashPassword(), AccessClaims, LIST_FIELDS, parse(), PlatformUsersService, idParams (+11 more)

### Community 70 - "scan.tsx"
Cohesion: 0.32
Nodes (5): ScanScreen(), Props, QrScanner(), useStyles, fetchToolByCode()

### Community 71 - "Tool Tracker: guía para Claude Code"
Cohesion: 0.50
Nodes (3): Comandos, Navegar el código con el grafo (ahorra tokens), Tool Tracker: guía para Claude Code

### Community 72 - "noNul"
Cohesion: 0.67
Nodes (3): noNul(), optionalText(), shortText()

## Knowledge Gaps
- **582 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+577 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 690 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@prisma/client` connect `app.ts` to `reports.routes.ts`, `helpers.ts`, `transfers.service.ts`, `platform.routes.ts`, `AppError`, `audit`, `auth.service.ts`, `tools.routes.ts`, `export.service.ts`, `api/package.json`, `server.ts`, `organizations.service.ts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _582 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `reports.routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08233117483811286 - nodes in this community are weakly interconnected._
- **Why does `react-native` connect `theme.ts` to `audit.tsx`, `lib/api.ts`, `react`, `Card`, `(tabs)/index.tsx`, `useTheme`, `app/_layout.tsx`, `transfer/new.tsx`, `mobile/package.json`, `ToolQrCard.tsx`, `PhotoPicker.tsx`, `useAuth`, `LocationPicker.tsx`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Should `helpers.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08396396396396397 - nodes in this community are weakly interconnected._
- **Why does `dependencies` connect `dependencies` to `mobile/package.json`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.023529411764705882 - nodes in this community are weakly interconnected._