# Graph Report - tool-tracker  (2026-10-21)

## Corpus Check
- 197 files · ~222,584 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 4, .example 4, .conf 3)

## Summary
- 1556 nodes · 4503 edges · 78 communities (70 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 97 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2f1da598`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- lib/api.ts
- reports.service.ts
- helpers.ts
- schemas.ts
- useTheme
- app.ts
- users/edit.tsx
- (tabs)/index.tsx
- scripts
- auth.service.ts
- tool/[id].tsx
- rentals.service.ts
- theme.ts
- Tool Tracker
- (tabs)/_layout.tsx
- dependencies
- 0_init/migration.sql
- api/package.json
- server.ts
- media.service.ts
- shared/package.json
- mobile/package.json
- expo
- PhotoPicker.tsx
- audit
- dependencies
- image.ts
- .badRequest
- enums.ts
- react
- LocationPicker.tsx
- compilerOptions
- devDependencies
- scripts
- users/api.ts
- state-machine.ts
- transfers.service.ts
- seed.ts
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
- .inventoryWorkbook
- rentals/api.ts
- types/api.ts
- tools/api.ts
- damage/api.ts
- ToolQrCard.tsx
- transfers/api.ts
- Despliegue (GitHub Actions → VPS)
- ref_vitest
- routing.ts
- local-storage.ts
- static-map.ts
- crashLog.ts
- damage-rentals.int.test.ts
- ReportsService
- app/_layout.tsx
- global-setup.ts
- (app)/_layout.tsx
- permissions.ts
- geo.ts
- UsersService
- notify
- Tool Tracker: guía para Claude Code
- Props
- assets.d.ts
- Props

## God Nodes (most connected - your core abstractions)
1. `useTheme()` - 117 edges
2. `react-native` - 64 edges
3. `Button()` - 53 edges
4. `react` - 51 edges
5. `ErrorBanner()` - 50 edges
6. `space` - 50 edges
7. `Card()` - 47 edges
8. `useAuth()` - 45 edges
9. `Loading()` - 41 edges
10. `makeStyles()` - 38 edges

## Surprising Connections (you probably didn't know these)
- `Riesgos aceptados y recomendaciones` --references--> `authenticate()`  [INFERRED]
  SECURITY.md → apps/api/src/middleware/auth.ts
- `Configurar GitHub (una vez, lo hace el dueño del repositorio)` --references--> `main()`  [INFERRED]
  docs/DEPLOY.md → apps/api/prisma/seed.ts
- `Flujo de trabajo` --references--> `main()`  [INFERRED]
  docs/DEPLOY.md → apps/api/prisma/seed.ts
- `Primer despliegue de cada entorno` --references--> `main()`  [INFERRED]
  docs/DEPLOY.md → apps/api/prisma/seed.ts
- `Hallazgos corregidos en esta fase` --references--> `redact()`  [INFERRED]
  SECURITY.md → apps/api/src/lib/audit.ts

## Import Cycles
- None detected.

## Communities (78 total, 8 thin omitted)

### Community 0 - "lib/api.ts"
Cohesion: 0.18
Nodes (11): api, ApiError, BASE_URL, Query, refresh(), request(), RequestOptions, session (+3 more)

### Community 1 - "reports.service.ts"
Cohesion: 0.21
Nodes (6): defaultSeriesRange(), fillByStatus(), isValidTimeZone(), LOSS_STATUS_LIST, MAINTENANCE_COST_EVENTS, overTimeQuery

### Community 2 - "helpers.ts"
Cohesion: 0.23
Nodes (19): hashPassword(), as(), Base, createTool(), createUser(), env, prisma, resetDb() (+11 more)

### Community 3 - "schemas.ts"
Cohesion: 0.03
Nodes (59): CatalogListQuery, catalogListQuerySchema, CategoryCreateInput, categoryCreateSchema, categoryUpdateSchema, COMMON_PINS, COORDS_MSG, DamageReportCreateInput (+51 more)

### Community 4 - "useTheme"
Cohesion: 0.11
Nodes (51): NewDamageReportScreen(), NewEventScreen(), NewLocationScreen(), styles, NewRentalScreen(), styles, ReturnRentalScreen(), ProfileScreen() (+43 more)

### Community 5 - "app.ts"
Cohesion: 0.08
Nodes (39): AppEnv, createApp(), AppError, authenticate(), authorize(), authorizeAny(), currentUser(), app (+31 more)

### Community 6 - "users/edit.tsx"
Cohesion: 0.10
Nodes (16): styles, THEME_OPTIONS, ROLE_HINT, styles, palette(), Props, styles, Variant (+8 more)

### Community 7 - "(tabs)/index.tsx"
Cohesion: 0.07
Nodes (53): Dashboard(), Panel(), pct(), pctText(), PendingCard(), PRESETS, QuickAction(), STATUS_ORDER (+45 more)

### Community 8 - "scripts"
Cohesion: 0.06
Nodes (34): ignoreCves, devDependencies, eslint, @eslint/js, prettier, typescript, typescript-eslint, engines (+26 more)

### Community 9 - "auth.service.ts"
Cohesion: 0.06
Nodes (26): authRouter(), loginAccountLimiter(), loginLimiter(), passThrough(), refreshLimiter(), ARGON2_OPTIONS, AuthService, checkCredential() (+18 more)

### Community 10 - "tool/[id].tsx"
Cohesion: 0.10
Nodes (26): COST_EVENTS, HINT, Condition(), Icon, Middle, RentalDetailScreen(), Step(), useStyles (+18 more)

### Community 11 - "rentals.service.ts"
Cohesion: 0.07
Nodes (15): Page, pageArgs(), toPage(), idParams, DETAIL_INCLUDE, isUniqueViolation(), LIST_INCLUDE, TOOL_SUMMARY (+7 more)

### Community 12 - "theme.ts"
Cohesion: 0.11
Nodes (39): RentalsScreen(), useStyles, LocationsScreen(), useStyles, TransfersScreen(), useStyles, Badge(), hasAccess() (+31 more)

### Community 13 - "Tool Tracker"
Cohesion: 0.11
Nodes (15): FakeDecimal, API (todas bajo `/api`, con `Authorization: Bearer` salvo auth), App móvil, Flujo de fotos, Primer arranque (sin Docker), Pruebas, Reglas de dominio, Reportes financieros (+7 more)

### Community 14 - "(tabs)/_layout.tsx"
Cohesion: 0.12
Nodes (18): HeaderLogo(), icon(), IconName, TabsLayout(), ThemeToggle(), C, isHovered(), Sidebar() (+10 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, expo, expo-camera, expo-constants, expo-crypto, expo-file-system, expo-image-manipulator, expo-image-picker (+24 more)

### Community 16 - "0_init/migration.sql"
Cohesion: 0.07
Nodes (58): "audit_log", audit_log_at_idx, audit_log_entity_entity_id_idx, "lifecycle_events", lifecycle_events_immutable, lifecycle_events_tool_id_occurred_at_idx, lifecycle_events_type_occurred_at_idx, "locations" (+50 more)

### Community 17 - "api/package.json"
Cohesion: 0.10
Nodes (20): @tt/shared, typescript, vitest, zod, name, private, type, version (+12 more)

### Community 18 - "server.ts"
Cohesion: 0.10
Nodes (17): Env, envSchema, loadEnv(), optionalUrl, prisma, s3Storage(), S3StorageConfig, osmTileFetcher() (+9 more)

### Community 19 - "media.service.ts"
Cohesion: 0.09
Nodes (24): checkDamageReport(), checkLifecycleEvent(), checkTransfer(), chronology(), COST_EVENTS, DamageCheck, LifecycleCheck, LockedTool (+16 more)

### Community 20 - "shared/package.json"
Cohesion: 0.10
Nodes (20): dependencies, zod, devDependencies, typescript, vitest, exports, files, typescript (+12 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.10
Nodes (19): @tt/shared, typescript, zod, main, name, private, version, expo-camera (+11 more)

### Community 22 - "expo"
Cohesion: 0.07
Nodes (29): backgroundColor, foregroundImage, adaptiveIcon, package, permissions, versionCode, projectId, typedRoutes (+21 more)

### Community 23 - "PhotoPicker.tsx"
Cohesion: 0.13
Nodes (25): PhotoStrip(), useStyles, Props, ToolCoverPhoto(), useStyles, compressImage(), MultiPhotoCapture(), Props (+17 more)

### Community 24 - "audit"
Cohesion: 0.11
Nodes (5): audit(), catalogRouter(), idParams, CatalogService, Ctx

### Community 25 - "dependencies"
Cohesion: 0.11
Nodes (18): dependencies, argon2, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, cors, exceljs, express, express-rate-limit (+10 more)

### Community 26 - "image.ts"
Cohesion: 0.26
Nodes (9): detectImageType(), IMAGE_LIMITS, ImageKind, ImageLimits, invalid(), PNG_SIGNATURE, ProcessedImage, processImage() (+1 more)

### Community 27 - ".badRequest"
Cohesion: 0.16
Nodes (10): checkRentalEvent(), attachPhotos(), lockTools(), AccessClaims, DamageService, RentalsService, transfersRouter(), TransfersService (+2 more)

### Community 28 - "enums.ts"
Cohesion: 0.06
Nodes (30): DAMAGE_KIND, DAMAGE_KIND_LABEL, DAMAGE_MAX_PHOTOS, DamageKind, EVENT_TYPE, ITEM_OUTCOME, ITEM_OUTCOME_LABEL, ItemOutcome (+22 more)

### Community 29 - "react"
Cohesion: 0.13
Nodes (21): purchaseDay(), schema, toForm(), NewToolScreen(), ModalSafeArea(), Props, CreateOption, Option (+13 more)

### Community 30 - "LocationPicker.tsx"
Cohesion: 0.14
Nodes (21): DEFAULT_CENTER, LatLng, leafletHtml(), LeafletOptions, MapMarker, LeafletView(), LeafletViewProps, styles (+13 more)

### Community 31 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule (+4 more)

### Community 32 - "devDependencies"
Cohesion: 0.20
Nodes (10): devDependencies, supertest, tsx, @types/cors, @types/express, @types/multer, @types/node, @types/supertest (+2 more)

### Community 33 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, prisma:generate, prisma:migrate, prisma:seed, prisma:validate, start (+3 more)

### Community 34 - "users/api.ts"
Cohesion: 0.38
Nodes (5): catalogKeys, keys, useCreateUser(), useInvalidate(), useUpdateUser()

### Community 35 - "state-machine.ts"
Cohesion: 0.22
Nodes (11): EventType, LocationType, availableEvents(), canReportDamage(), DAMAGE_REPORTABLE, EVENT_REQUIRES_LOCATION, isTerminal(), resolveTransition() (+3 more)

### Community 36 - "transfers.service.ts"
Cohesion: 0.10
Nodes (6): ObjectStorage, TileFetcher, idParams, ActorCtx, Ctx, DETAIL_INCLUDE

### Community 37 - "seed.ts"
Cohesion: 0.33
Nodes (3): CATEGORIES, prisma, argon2

### Community 38 - "api/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, exclude, extends, include, ../../tsconfig.base.json

### Community 39 - "mobile/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, noUncheckedIndexedAccess, paths, strict, extends, include, expo/tsconfig.base

### Community 40 - "reports.ts"
Cohesion: 0.32
Nodes (6): ToolStatus, CategorySpendRow, LossReport, LossRow, ReportSummary, SpendPeriodRow

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
Cohesion: 0.10
Nodes (24): transfer(), bitacoraEntries(), COLUMNS, EVENT_LABEL, EVENT_TONE, EVIDENCE_PHOTO, GRID, hasPoint() (+16 more)

### Community 45 - "devDependencies"
Cohesion: 0.50
Nodes (4): devDependencies, @types/qrcode, @types/react, typescript

### Community 46 - "schemas.test.ts"
Cohesion: 0.17
Nodes (11): credentialSchemaFor(), damageReportCreateSchema, isRunOrRepeat(), money, pinSchema, rentalCreateSchema, rentalReturnSchema, transferCreateSchema (+3 more)

### Community 47 - "entorno.sh"
Cohesion: 0.15
Nodes (18): cwd_pm2(), fallar(), log(), pid_de(), prisma(), recargar(), responde(), sana() (+10 more)

### Community 48 - "transfer/new.tsx"
Cohesion: 0.22
Nodes (16): ToolsScreen(), useStyles, NewTransferScreen(), STEPS, useStyles, Stepper(), useStyles, useCategories() (+8 more)

### Community 49 - ".inventoryWorkbook"
Cohesion: 0.21
Nodes (9): dayLabel(), duration(), ExportService, gridTable(), km(), link(), paintRow(), solid() (+1 more)

### Community 50 - "rentals/api.ts"
Cohesion: 0.18
Nodes (10): invalidate(), rentalKeys, RentalPayload, RentalReturnPayload, useCreateRental(), useRentalsInfinite(), useReturnRental(), Page (+2 more)

### Community 51 - "types/api.ts"
Cohesion: 0.20
Nodes (9): Category, HistoryEvent, Location, ManagedUser, MapPlace, PhotoRef, Ref, UserLite (+1 more)

### Community 52 - "tools/api.ts"
Cohesion: 0.18
Nodes (12): Props, CategoryCount, fetchAllTools(), ToolFilters, useCreateTool(), useToolCategoryCounts(), useToolHistory(), useToolsAtLocation() (+4 more)

### Community 53 - "damage/api.ts"
Cohesion: 0.17
Nodes (9): damageKeys, DamagePayload, useCreateDamageReport(), useDamageReports(), LifecyclePayload, useCreateLifecycleEvent(), toolKeys, DamageReport (+1 more)

### Community 54 - "ToolQrCard.tsx"
Cohesion: 0.28
Nodes (10): escapeHtml(), labelsHtml(), QrLabel, qrPath(), qrSvg(), styles, ToolQrCard(), printHtml() (+2 more)

### Community 55 - "transfers/api.ts"
Cohesion: 0.15
Nodes (11): PendingFilter, ReceivePayload, transferKeys, TransferPayload, useAddTransferPhotos(), useCreateTransfer(), useReceiveTransfer(), useTransferMap() (+3 more)

### Community 56 - "Despliegue (GitHub Actions → VPS)"
Cohesion: 0.24
Nodes (10): main(), Acceso a development (no público), Configurar GitHub (una vez, lo hace el dueño del repositorio), Despliegue (GitHub Actions → VPS), Estado del servidor (ya preparado), Flujo de trabajo, Operación (como `tooltracker`: `sudo -iu tooltracker`), Primer despliegue de cada entorno (+2 more)

### Community 57 - "ref_vitest"
Cohesion: 0.20
Nodes (4): app, app, PASSWORD, supertest

### Community 58 - "routing.ts"
Cohesion: 0.25
Nodes (8): flip(), LatLng, Route, routeProvider, RoutingConfig, simplify(), A, B

### Community 59 - "local-storage.ts"
Cohesion: 0.31
Nodes (5): localFilesRouter(), localStorage(), LocalStorageConfig, resolveKey(), sign()

### Community 60 - "static-map.ts"
Cohesion: 0.31
Nodes (8): fitZoom(), LatLng, project(), renderStaticMap(), StaticMapInput, COMAYAGUA, TEGUS, sharp

### Community 61 - "crashLog.ts"
Cohesion: 0.25
Nodes (8): crashFile(), CrashRecord, ErrorUtilsLike, GlobalHandler, installCrashRecorder(), recordCrash(), expo-constants, expo-file-system

### Community 62 - "damage-rentals.int.test.ts"
Cohesion: 0.24
Nodes (6): jpeg(), photoIds(), uploadReal(), fakePhoto(), storage, TestUser

### Community 64 - "app/_layout.tsx"
Cohesion: 0.36
Nodes (8): RootLayout(), RootNavigator(), ThemedNavigation(), AuthProvider(), ThemeProvider(), takeLastCrash(), expo-status-bar, react-native-safe-area-context

### Community 65 - "global-setup.ts"
Cohesion: 0.36
Nodes (4): apiRoot, setup(), assertTestDatabase(), TEST_DATABASE_URL

### Community 66 - "(app)/_layout.tsx"
Cohesion: 0.39
Nodes (7): AppLayout(), BackButton(), ErrorBoundary(), goHome(), HomeButton(), ErrorBoundary(), ErrorScreen()

### Community 67 - "permissions.ts"
Cohesion: 0.53
Nodes (4): Role, can(), Permission, ROLE_PERMISSIONS

### Community 68 - "geo.ts"
Cohesion: 0.50
Nodes (4): distanceM(), GeoPhoto, photoDistances(), Point

### Community 70 - "notify"
Cohesion: 0.83
Nodes (3): ScanScreen(), fetchToolByCode(), notify()

### Community 71 - "Tool Tracker: guía para Claude Code"
Cohesion: 0.50
Nodes (3): Comandos, Navegar el código con el grafo (ahorra tokens), Tool Tracker: guía para Claude Code

## Knowledge Gaps
- **491 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+486 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 577 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `mobile/package.json`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _491 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `schemas.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.03277009728622632 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `media.service.ts` to `reports.service.ts`, `helpers.ts`, `transfers.service.ts`, `app.ts`, `seed.ts`, `auth.service.ts`, `rentals.service.ts`, `export.service.ts`, `api/package.json`, `server.ts`, `audit`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `useTheme` be split into smaller, more focused modules?**
  _Cohesion score 0.10954616588419405 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `app/_layout.tsx`, `useTheme`, `notify`, `(tabs)/index.tsx`, `users/edit.tsx`, `tool/[id].tsx`, `theme.ts`, `(tabs)/_layout.tsx`, `transfer/new.tsx`, `mobile/package.json`, `ToolQrCard.tsx`, `PhotoPicker.tsx`, `LocationPicker.tsx`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Should `app.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08249496981891348 - nodes in this community are weakly interconnected._