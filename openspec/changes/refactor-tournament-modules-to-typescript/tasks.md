## 1. Implementation
- [ ] 1.1 Convert server/modules/tournament/standings.js → standings.ts
  - Type Prisma client and function signatures (recordMatchResult, getStandings, recalculateTiebreakers, validateStandings)
  - Keep exports CommonJS-compatible for existing require() usage
- [ ] 1.2 Convert server/modules/tournament/draft-socket-handler.js → draft-socket-handler.ts
  - Type socket, isAuthed, getPlayerBySocket, payloads
  - Import typed engine methods; keep event names unchanged
- [ ] 1.3 Convert server/modules/tournament/engine.js → engine.ts
  - Define interfaces for DraftState, SessionEntry, EngineDeps, and public API (setDeps, makePick, choosePack, getState)
  - Type Redis lock, publish/persist helpers, and data transforms
- [ ] 1.4 Adjust module loader for dev/prod resolution
  - Update server/modules/tournament/index.js `loadEngine()` to prefer TS in dev and JS in prod (robust fallback)
  - Ensure `server/index.ts` async dependency injection (setDeps) continues to work
- [ ] 1.5 Add or refine ambient types under server/types/ if needed (e.g., socket events, engine state)
- [ ] 1.6 Ensure ESLint/TS configs do not flag the new server .ts files (no-op expected)

## 2. Validation
- [ ] 2.1 Build dev: `npm run server:dev` boots and logs "engine dependencies injected"
- [ ] 2.2 Build prod: `npm run server:build` then `npm run server:start` works with compiled JS
- [ ] 2.3 Socket runtime:
  - [ ] makeTournamentDraftPick emits local echo and `draftUpdate`; Redis publishes on DRAFT_STATE_CHANNEL
  - [ ] chooseTournamentDraftPack transitions to picking and broadcasts `draftUpdate`
- [ ] 2.4 Standings:
  - [ ] recordMatchResult handles win/loss and draw in a single transaction
  - [ ] recalculateTiebreakers runs without type errors and updates expected fields
- [ ] 2.5 No change in event names/payload shapes (back-compat)

## 3. Documentation
- [ ] 3.1 Note refactor-only nature in PR description
- [ ] 3.2 Outline dev/prod loader behavior for the engine and how to extend types in future
