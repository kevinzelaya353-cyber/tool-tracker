# Graph Report - tool-tracker  (2026-10-15)

## Corpus Check
- 132 files · ~37,300 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 6 file(s) not represented in the graph (top: (none) 3, .example 2, .prisma 1)

## Summary
- 945 nodes · 2301 edges · 48 communities (45 shown, 3 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 68 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- tools/api.ts
- packages_shared_dist_index
- helpers.ts
- schemas.ts
- transfer/new.tsx
- app.ts
- event/new.tsx
- reports.tsx
- scripts
- token.service.ts
- tool/[id].tsx
- tools.routes.ts
- theme.ts
- audit.ts
- tools.tsx
- dependencies
- auth.ts
- api/package.json
- server.ts
- AppError
- shared/package.json
- mobile/package.json
- expo
- PhotoPicker.tsx
- catalog.routes.ts
- dependencies
- media.service.ts
- .create
- enums.ts
- audit
- auth.service.ts
- compilerOptions
- devDependencies
- scripts
- users.service.ts
- state-machine.ts
- ObjectStorage
- @prisma/client
- api/tsconfig.json
- mobile/tsconfig.json
- reports.ts
- shared/tsconfig.json
- metro.config.js
- scripts
- storage.ts
- devDependencies
- schemas.test.ts
- noNul

## God Nodes (most connected - your core abstractions)
1. `react-native` - 33 edges
2. `colors` - 29 edges
3. `space` - 28 edges
4. `createApp()` - 26 edges
5. `audit()` - 25 edges
6. `react` - 25 edges
7. `AppError` - 24 edges
8. `NewTransferScreen()` - 22 edges
9. `ErrorBanner()` - 21 edges
10. `font` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Riesgos aceptados y recomendaciones` --references--> `authenticate()`  [INFERRED]
  SECURITY.md → apps/api/src/middleware/auth.ts
- `Hallazgos corregidos en esta fase` --references--> `redact()`  [INFERRED]
  SECURITY.md → apps/api/src/lib/audit.ts
- `createApp()` --indirect_call--> `errorHandler()`  [INFERRED]
  apps/api/src/app.ts → apps/api/src/middleware/error-handler.ts
- `createApp()` --indirect_call--> `notFound()`  [INFERRED]
  apps/api/src/app.ts → apps/api/src/middleware/error-handler.ts
- `createApp()` --calls--> `TokenService`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/modules/auth/token.service.ts

## Import Cycles
- None detected.

## Communities (48 total, 3 thin omitted)

### Community 0 - "tools/api.ts"
Cohesion: 0.06
Nodes (46): ScanScreen(), RootLayout(), RootNavigator(), Props, AuthContext, AuthContextValue, AuthProvider(), Status (+38 more)

### Community 1 - "packages_shared_dist_index"
Cohesion: 0.06
Nodes (25): checkLifecycleEvent(), checkTransfer(), chronology(), COST_EVENTS, LifecycleCheck, LockedTool, RuleViolation, defaultSeriesRange() (+17 more)

### Community 2 - "helpers.ts"
Cohesion: 0.12
Nodes (25): hashPassword(), apiRoot, setup(), app, as(), Base, createTool(), createUser() (+17 more)

### Community 3 - "schemas.ts"
Cohesion: 0.05
Nodes (39): CatalogListQuery, catalogListQuerySchema, CategoryCreateInput, categoryCreateSchema, categoryUpdateSchema, id, LifecycleEventCreateInput, lifecycleEventCreateSchema (+31 more)

### Community 4 - "transfer/new.tsx"
Cohesion: 0.14
Nodes (27): NewEventScreen(), NewToolScreen(), TextKey, NewTransferScreen(), STEPS, styles, LoginScreen(), styles (+19 more)

### Community 5 - "app.ts"
Cohesion: 0.14
Nodes (21): AppEnv, createApp(), app, authenticate(), authorize(), currentUser(), notFound(), validate() (+13 more)

### Community 6 - "event/new.tsx"
Cohesion: 0.10
Nodes (21): COST_EVENTS, HINT, ProfileScreen(), ROLE_LABEL, styles, palette, Props, styles (+13 more)

### Community 7 - "reports.tsx"
Cohesion: 0.15
Nodes (26): Dashboard(), QuickAction(), STATUS_ORDER, styles, ReportsScreen(), SPEND_SERIES, styles, HBarChart() (+18 more)

### Community 8 - "scripts"
Cohesion: 0.07
Nodes (29): devDependencies, eslint, @eslint/js, prettier, typescript, typescript-eslint, engines, node (+21 more)

### Community 9 - "token.service.ts"
Cohesion: 0.11
Nodes (7): RefreshTokenStore, reused(), StoredRefreshToken, cfg, user, TokenService, TokenServiceConfig

### Community 10 - "tool/[id].tsx"
Cohesion: 0.13
Nodes (22): Fact(), styles, ToolDetailScreen(), Row(), styles, TransferDetailScreen(), PhotoStrip(), styles (+14 more)

### Community 11 - "tools.routes.ts"
Cohesion: 0.13
Nodes (9): Page, pageArgs(), toPage(), codeParams, idParams, toolsRouter(), Ctx, LIST_INCLUDE (+1 more)

### Community 12 - "theme.ts"
Cohesion: 0.14
Nodes (18): Props, StatTile(), styles, StatusBadge(), styles, styles, ToolCard(), Props (+10 more)

### Community 13 - "audit.ts"
Cohesion: 0.09
Nodes (19): AuditEntry, Db, isPlainObject(), redact(), FakeDecimal, API (todas bajo `/api`, con `Authorization: Bearer` salvo auth), App móvil, Flujo de fotos (+11 more)

### Community 14 - "tools.tsx"
Cohesion: 0.15
Nodes (18): icon(), IconName, TabsLayout(), styles, ToolsScreen(), styles, TransfersScreen(), Chip() (+10 more)

### Community 15 - "dependencies"
Cohesion: 0.08
Nodes (24): dependencies, expo, expo-camera, expo-constants, expo-image-manipulator, expo-image-picker, expo-linking, @expo/metro-runtime (+16 more)

### Community 16 - "auth.ts"
Cohesion: 0.14
Nodes (11): authorizeAny(), Part, auditQuery, idParams, upload, UPLOAD_LIMITS, uploadLimiter, urlsBody (+3 more)

### Community 17 - "api/package.json"
Cohesion: 0.10
Nodes (20): @tt/shared, typescript, vitest, zod, name, private, type, version (+12 more)

### Community 18 - "server.ts"
Cohesion: 0.14
Nodes (13): Env, envSchema, loadEnv(), optionalUrl, localFilesRouter(), localStorage(), LocalStorageConfig, resolveKey() (+5 more)

### Community 19 - "AppError"
Cohesion: 0.16
Nodes (10): AppError, lockTools(), Tx, app, fakeTokens, errorHandler(), PRISMA_ERRORS, CLEARS_CUSTODIAN (+2 more)

### Community 20 - "shared/package.json"
Cohesion: 0.10
Nodes (19): dependencies, zod, devDependencies, typescript, vitest, exports, typescript, vitest (+11 more)

### Community 21 - "mobile/package.json"
Cohesion: 0.11
Nodes (18): @tt/shared, typescript, zod, main, name, private, version, expo-constants (+10 more)

### Community 22 - "expo"
Cohesion: 0.11
Nodes (17): edgeToEdgeEnabled, package, typedRoutes, expo, android, experiments, ios, name (+9 more)

### Community 23 - "PhotoPicker.tsx"
Cohesion: 0.22
Nodes (11): compressImage(), MultiPhotoCapture(), Props, styles, Item, PhotoPicker(), Props, styles (+3 more)

### Community 25 - "dependencies"
Cohesion: 0.12
Nodes (16): dependencies, argon2, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, cors, express, express-rate-limit, helmet (+8 more)

### Community 26 - "media.service.ts"
Cohesion: 0.20
Nodes (12): detectImageType(), IMAGE_LIMITS, ImageKind, ImageLimits, invalid(), PNG_SIGNATURE, ProcessedImage, processImage() (+4 more)

### Community 27 - ".create"
Cohesion: 0.23
Nodes (5): attachPhotos(), AccessClaims, UsersService, Express, Locals

### Community 28 - "enums.ts"
Cohesion: 0.20
Nodes (11): EVENT_TYPE, LOCATION_TYPE, LOSS_STATUSES, MANUAL_EVENT_TYPE, ManualEventType, Role, TOOL_STATUS, TOOL_STATUS_LABEL (+3 more)

### Community 29 - "audit"
Cohesion: 0.32
Nodes (3): audit(), catalogRouter(), CatalogService

### Community 30 - "auth.service.ts"
Cohesion: 0.17
Nodes (6): loginAccountLimiter, loginLimiter, refreshLimiter, ARGON2_OPTIONS, SessionUser, express-rate-limit

### Community 31 - "compilerOptions"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule (+4 more)

### Community 32 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, prisma, supertest, tsx, @types/cors, @types/express, @types/multer, @types/node (+3 more)

### Community 33 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, prisma:generate, prisma:migrate, prisma:seed, prisma:validate, start (+3 more)

### Community 34 - "users.service.ts"
Cohesion: 0.22
Nodes (4): idParams, listQuery, ADMIN_FIELDS, PUBLIC_FIELDS

### Community 35 - "state-machine.ts"
Cohesion: 0.25
Nodes (9): EventType, LocationType, availableEvents(), EVENT_REQUIRES_LOCATION, isTerminal(), resolveTransition(), Transition, TransitionResult (+1 more)

### Community 37 - "@prisma/client"
Cohesion: 0.22
Nodes (5): CATEGORIES, prisma, prisma, argon2, @prisma/client

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
Cohesion: 0.29
Nodes (7): scripts, android, ios, start, test, typecheck, web

### Community 44 - "storage.ts"
Cohesion: 0.40
Nodes (4): s3Storage(), S3StorageConfig, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### Community 45 - "devDependencies"
Cohesion: 0.67
Nodes (3): devDependencies, @types/react, typescript

### Community 47 - "noNul"
Cohesion: 0.67
Nodes (3): noNul(), optionalText(), shortText()

## Knowledge Gaps
- **31 isolated node(s):** `@tt/shared`, `pino`, `zod`, `@types/cors`, `@types/express` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 432 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `mobile/package.json`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `createApp()` (e.g. with `errorHandler()` and `notFound()`) actually correct?**
  _`createApp()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `@tt/shared`, `pino`, `zod` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `tools/api.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05853174603174603 - nodes in this community are weakly interconnected._
- **Why does `express` connect `auth.ts` to `packages_shared_dist_index`, `users.service.ts`, `app.ts`, `tools.routes.ts`, `api/package.json`, `server.ts`, `AppError`, `catalog.routes.ts`, `auth.service.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Should `packages_shared_dist_index` be split into smaller, more focused modules?**
  _Cohesion score 0.06262626262626263 - nodes in this community are weakly interconnected._
- **Why does `@prisma/client` connect `@prisma/client` to `packages_shared_dist_index`, `users.service.ts`, `helpers.ts`, `app.ts`, `token.service.ts`, `tools.routes.ts`, `audit.ts`, `auth.ts`, `api/package.json`, `AppError`, `catalog.routes.ts`, `media.service.ts`, `auth.service.ts`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._