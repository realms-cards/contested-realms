## Overview
`server/index.js` currently owns bootstrap, socket wiring, feature handlers, persistence helpers, and background services. The refactor introduces an explicit composition root with a dependency registry and pushes feature-specific logic into dedicated modules. At the same time, we enable incremental TypeScript adoption so that new modules can opt into typing without blocking the rest of the runtime.

## Target Directory Layout
```
server/
  core/
    bootstrap/         # Startup orchestration, env loading, Prisma init
    container.ts       # Dependency registry + lifecycle helpers
  infrastructure/
    config/            # Config loader + env validation (converted to TS)
    prisma/            # Prisma client wrapper + repositories (TS)
    logger/            # Winston/pino wrapper (TS)
    sockets/           # Socket.IO server factory + namespace utilities
  features/
    lobby/             # Lobby + matchmaking handlers, state helpers
    game/              # Game session orchestration, patch enrichment
    tournament/        # Tournament standings/broadcast, pairings
    draft/             # Draft configuration + seat management
    replay/            # Replay ingest/export utilities
  support/
    jobs/              # Scheduled/background tasks registration
    metrics/           # Optional metrics emitters
  index.ts             # Thin entrypoint that composes container + features
```

## Module Responsibilities
- `core/bootstrap`: Assemble configuration, initialize Prisma, create the socket server, and call `register(container)` on each module. Exposes `startServer()` used by CLI/Docker.
- `core/container`: Provide dependency injection-lite registry with lifecycle hooks (`onInit`, `onShutdown`), context (`logger`, `prisma`, `config`), and event registration helpers (`registerEvent(namespace, event, handler)`).
- `infrastructure/*`: House reusable primitives. The first migration target to TypeScript because the surface area is small and provides types for the rest of the runtime.
- `features/*`: Each feature exports `register(container)` to attach socket listeners, background jobs, and domain helpers. Feature modules receive typed dependencies via the container.
- `support/*`: Cross-cutting background tasks and optional instrumentation live here. Move existing cron-like jobs from the monolith file.

## TypeScript Strategy
- Introduce `server/tsconfig.json` extending the root config with `outDir: dist/server` and `include` for `server/**/*.ts`. Configure `allowJs` and `checkJs` for mixed mode while we migrate.
- Use `tsx` (preferred) or `ts-node-dev` during development for zero-config execution of `.ts` entrypoints.
- Production build uses `tsc --build server/tsconfig.json`; Dockerfile references `node dist/server/index.js`.
- Add ambient type declarations for modules that remain JavaScript (`*.d.ts` under `types/server`). Example: augment socket.io Server events to reflect custom events (`server/types/socket-events.d.ts`).
- Prioritize converting infrastructure utilities and new modules; leave high-churn feature modules in JS until the team is comfortable.

## Risks & Mitigations
- **Regression risk while extracting handlers**: ensure comprehensive smoke tests and leverage TypeScript types on shared payloads to catch mismatches.
- **Runtime drift between dev and prod**: align `server:start` to use compiled output even locally (with watch mode) to detect build issues early.
- **Contributor confusion**: update docs with module diagram and migration checklist; add lint rule to forbid deep imports across module boundaries.

## Open Questions
- Do we need a shared schema for socket payloads (zod/io-ts) to maximize value from TypeScript?
- Should background jobs move to a separate worker process eventually, or can the container abstraction handle future scaling?
