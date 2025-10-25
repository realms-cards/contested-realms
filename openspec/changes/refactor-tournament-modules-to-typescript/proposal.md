## Why
The tournament server modules are still written in JavaScript while the rest of the Socket.IO server has migrated to TypeScript. This creates ongoing type gaps, weaker editor feedback, and higher risk of runtime errors in critical flows (draft engine, standings updates). Converting these modules to TypeScript will align the server codebase, improve maintainability, and reduce regressions.

## What Changes
- Convert server/modules/tournament/* to TypeScript (no behavior changes):
  - engine.js → engine.ts (draft engine, Redis locking, batched persistence)
  - standings.js → standings.ts (transactional standings updates, tiebreakers, validation)
  - draft-socket-handler.js → draft-socket-handler.ts (socket events for draft pick/pack)
- Keep compatibility in the loader:
  - Update loadEngine to resolve engine in dev (ts) and prod (compiled js) robustly.
- Introduce minimal shared types (state, payloads, deps) under server/types/ if needed.
- Ensure server/index.ts type wiring for setDeps and draft broadcasts remains unchanged at runtime.
- Maintain event names and payload shapes (DRAFT_READY, draftUpdate, etc.).

## Impact
- Affected code: server/modules/tournament/**, server/index.ts (type wiring only), possibly eslint/tsconfig adjustments.
- Affected specs: new non-functional requirement under a "tournament-runtime" capability that the tournament modules SHALL be TypeScript and preserve behavior.
- Build/dev: should continue working with `tsx watch` (dev) and `server:build` (prod), no deployment pipeline changes.
- Risk: low (refactor-only). Add targeted runtime checks in dev to verify broadcasts and engine dependency injection.
