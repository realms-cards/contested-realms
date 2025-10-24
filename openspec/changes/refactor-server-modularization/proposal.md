## Why
- `server/index.js` is ~6.6k lines and mixes bootstrap, matchmaking, lobby, draft, tournament, replay, and persistence logic, making changes risky and slowing feature delivery.
- Lack of module boundaries prevents focused testing and reuse across other runtimes (e.g., bots) and makes it harder to onboard contributors.
- The runtime is still JavaScript-only, so adding types or editor tooling is difficult; contributors keep reintroducing bugs that strict typing would have caught.

## What Changes
- Split the Socket.IO server into composable modules grouped by responsibility (`bootstrap`, `infrastructure`, `features`, `support`) with a thin entrypoint that wires dependencies together.
- Introduce a shared service container so extracted modules can register lifecycle hooks, socket event handlers, and background jobs without touching the main file.
- Establish a dedicated `server/tsconfig.json`, build pipeline (tsup/tsc), and npm scripts so the server can run with mixed `.js`/`.ts` sources while emitting compiled output for production.
- Convert the first set of low-risk utilities (config loader, Prisma wrapper, logger) to TypeScript to validate the toolchain and provide migration examples.
- Document module boundaries, dependency rules, and migration conventions so future refactors stay consistent.

## Impact
- Development workflow adds `npm run server:build` / `server:dev` commands and a new output directory (ignored by git) for compiled assets.
- Local testing should cover the refactored modules; we will need to backfill unit tests for extracted features to maintain confidence.
- Deployment scripts or Dockerfiles pointing to `server/index.js` must be updated to the new entrypoint path (compiled or ts-node wrapper).
- Incremental TypeScript adoption becomes feasible without blocking ongoing JavaScript work; team members can port features as they touch them.
