## ADDED Requirements
### Requirement: Type-safe Tournament Module Runtime
The tournament server modules SHALL be implemented in TypeScript and preserve existing behavior and protocol compatibility.

#### Scenario: Server boots with TypeScript tournament modules
- WHEN the developer runs `npm run server:dev`
- THEN the Socket.IO server starts successfully with TypeScript tournament modules loaded and engine dependencies injected

#### Scenario: Production build uses compiled JS outputs
- WHEN `npm run server:build` is executed and the server is started via `npm run server:start`
- THEN the runtime loads compiled CommonJS JavaScript for tournament modules without changing behavior

#### Scenario: Draft engine events remain compatible
- WHEN a player emits `makeTournamentDraftPick` with a valid payload
- THEN the engine processes the pick, broadcasts `draftUpdate`, and publishes to the Redis `draft:session:update` channel

#### Scenario: Pack selection remains compatible
- WHEN a player emits `chooseTournamentDraftPack` with a valid payload
- THEN the engine transitions to picking and broadcasts `draftUpdate` with the updated state

#### Scenario: Standings updates remain atomic and typed
- WHEN a match result is recorded (win/loss or draw)
- THEN standings updates are performed atomically via Prisma transactions with typed inputs/outputs and no behavior change
