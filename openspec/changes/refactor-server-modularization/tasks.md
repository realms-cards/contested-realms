## 1. Architecture Baseline
- [x] 1.1 Inventory responsibilities in `server/index.js` and map them to target modules (bootstrap, infrastructure, features, support).
- [x] 1.2 Capture current socket event surface area and background jobs so extractions do not miss handlers.

## 2. Module Extraction
- [x] 2.1 Create `server/core/bootstrap` with startup orchestration (env load, Prisma init, Socket.IO creation).
- [x] 2.2 Move lobby/matchmaking handlers into `server/features/lobby` with isolated state management helpers.
- [x] 2.3 Extract tournament/draft/replay services into dedicated subdirectories and publish them via an index barrel _(tournament socket + presence module complete)_.
- [x] 2.4 Introduce a lightweight dependency registry so feature modules can register handlers without touching the entrypoint.
- [x] 2.5 Replace direct imports in the entrypoint with the new module exports and ensure hot reload/dev flow still works.

## 3. TypeScript Enablement
- [x] 3.1 Add `server/tsconfig.json`, extend root config, and configure outDir for compiled artifacts.
- [x] 3.2 Update npm scripts to support `npm run server:dev` (ts-node/tsx) and `npm run server:build` / `server:start`.
- [x] 3.3 Convert shared utilities (config loader, logger, Prisma client helper) to `.ts` and fix consuming imports.
- [ ] 3.4 Ensure emitted types are compatible with existing JavaScript modules and add ambient type declarations where needed.

## 4. Quality & Documentation
- [ ] 4.1 Backfill unit tests or integration smoke tests for extracted modules (at least lobby and tournament handlers).
- [ ] 4.2 Update deployment docs/Dockerfiles to reference the new compiled entrypoint.
- [ ] 4.3 Record migration guidelines (folder structure, naming, TS conventions) in `docs/server-architecture.md`.
- [ ] 4.4 Run lint, typecheck, and smoke test scripts; address regressions before marking complete.
