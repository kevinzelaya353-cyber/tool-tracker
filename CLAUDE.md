# Tool Tracker: guía para Claude Code

Monorepo pnpm: `apps/api` (Express 5 + Prisma + PostgreSQL), `apps/mobile` (Expo), `packages/shared`
(máquina de estados, permisos, esquemas Zod). Detalles en README.md y SECURITY.md.

**Multi-tenant** (docs/MULTI_TENANT.md): los servicios de una organización reciben el cliente Prisma
con aislamiento (`lib/tenant-prisma.ts`); toda alta lleva `organizationId: requireOrgId()` y todo SQL
escrito a mano filtra por `requireOrgId()`. Nunca tomar la organización del cuerpo de la petición.

## Navegar el código con el grafo (ahorra tokens)

Antes de abrir muchos archivos para entender algo, consulta el grafo de graphify:

- `graphify-out/GRAPH_REPORT.md`: mapa de comunidades/módulos y nodos más conectados.
- `graphify query "<pregunta o símbolos>" --budget 2000`: subgrafo relevante con archivo y línea.
- `graphify explain "<símbolo>"`: un nodo y sus vecinos.
- `graphify path "A" "B"`: cómo se conectan dos símbolos.

Lee solo los archivos y líneas que el grafo señale. Tras cambios grandes de código,
regenera con `graphify update .` (local, sin LLM).

## Comandos

- Pruebas: `pnpm test` (unitarias), `pnpm test:int` (integración, reinicia la BD `tool_tracker_test`).
- Calidad: `pnpm typecheck`, `pnpm lint`.
- En PowerShell usar `pnpm.cmd` si la política de ejecución bloquea `pnpm.ps1`.
