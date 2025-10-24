# Server Architecture Overview

## Runtime Composition
- `server/index.ts` is the composition root. It bootstraps Prisma, Socket.IO, Redis clients, and registers feature modules via the feature registry.
- `server/core/bootstrap/` encapsulates environment loading, config parsing, and Redis/socket instantiation. The module exports typed helpers so new services can reuse them.
- Feature modules live under `server/features/<name>/` and must expose a `registerSocketHandlers` method. The registry ensures handlers are wired without editing the entrypoint.
- Shared infrastructure (card costs, tournament engines, draft helpers) resides in `server/modules/`. Prefer subdirectories with an `index.ts` barrel for related functionality.

## TypeScript Conventions
- Incremental typing is enabled through `server/tsconfig.json`. The compiler emits to `dist/server` and copies existing `.js` modules so mixed JS/TS code works.
- New utilities should be authored in `.ts` files with explicit exports. When consuming from legacy CommonJS code, use the named export (`const { foo } = require('./path')`) until the caller is converted to ES modules.
- Add `// @ts-nocheck` only as a temporary escape hatch. Prefer defining basic interfaces or `type` aliases (e.g. `ServerConfig`, `FeatureRegistryContext`) when introducing new modules.

## Module Guidelines
- **Config & Bootstrapping:** Use `server/core/config.ts` to derive environment-aware settings. The bootstrap module accepts dependency overrides for testing.
- **Logging:** `server/core/logger.ts` centralizes scoped logging helpers. Create one logger per subsystem to keep console output consistent.
- **Prisma:** `server/core/prisma.ts` exposes a `createPrismaClient` helper so integration tests can swap in a mocked client.
- **Feature Registration:** `server/core/featureRegistry.ts` maintains feature instances and socket connection hooks. Always register features through this API to keep entrypoint churn minimal.

## Migration Checklist
1. Author new server modules in TypeScript and add them to the appropriate barrel (`server/modules/index.js` or a feature-specific `index.ts`).
2. Export factory functions instead of singletons so the registry can inject shared dependencies.
3. Update `server/index.ts` to register the module through `featureRegistry.registerFeature(...)`.
4. Run `npm run server:build` to ensure the mixed JS/TS build succeeds and `npm run server:start` to smoke test the compiled output.
