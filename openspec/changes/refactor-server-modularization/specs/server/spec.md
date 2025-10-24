## ADDED Requirements

### Requirement: Modular Server Composition
The Socket.IO server MUST load core services and feature handlers through dedicated modules instead of concentrating logic in a single entrypoint file.

#### Scenario: Feature modules register via container
- **GIVEN** the server runtime
- **WHEN** it boots
- **THEN** it imports feature modules from `server/features/*`
- **AND** each module registers its socket listeners through a shared container API
- **AND** no single source file in the server exceeds 500 lines of code.

### Requirement: Incremental TypeScript Compatibility
The server toolchain MUST support TypeScript sources alongside existing JavaScript modules without requiring a big-bang migration.

#### Scenario: Mixed JS and TS server start
- **GIVEN** a project with `.js` and `.ts` files under `server/`
- **WHEN** a developer runs `npm run server:dev`
- **THEN** the entrypoint executes successfully with ts-node/tsx
- **AND** `.ts` files are type-checked
- **AND** `.js` files continue to run without modification.

### Requirement: Compiled Production Entry Point
The production deployment MUST execute the compiled TypeScript output rather than raw sources to ensure consistent runtime behavior.

#### Scenario: Build output is used in production
- **GIVEN** a production build
- **WHEN** `npm run server:start` executes
- **THEN** it runs `node dist/server/index.js` (or equivalent compiled output)
- **AND** the build step fails if there are type errors in TypeScript sources.
