# AI Agent Guide - Sorcery Client

This guide helps AI coding assistants (Claude, Copilot, Cursor, etc.) understand the architecture and conventions of this project. Read this before making changes.

## Project Overview

A web-based client for playing [Sorcery: Contested Realm](https://www.sorcerytcg.com/) online. 3D game board, real-time multiplayer, draft/sealed modes, tournaments, CPU bots, deck building, and collection tracking.

**Stack**: Next.js 15 + React 19 + TypeScript 5 + React Three Fiber + Socket.IO + PostgreSQL (Prisma) + Redis

## Architecture

### Client-Server Model

```
Browser (Next.js)          Socket.IO Server           PostgreSQL
┌──────────────────┐       ┌──────────────┐          ┌──────────┐
│ Zustand Store    │◄─────►│ Event Handler│◄────────►│ Prisma   │
│ (game state)     │patches│ + Rules      │          │ 46 models│
│                  │       │ + Redis cache│          │          │
│ React Three Fiber│       └──────────────┘          └──────────┘
│ (3D board)       │
└──────────────────┘
```

- **Server is authoritative** for online matches. Client sends actions, server validates and broadcasts state patches.
- **Zustand store** manages all client game state with 80+ slices (core, cards, UI, network).
- **Patches flow one-way**: server → all clients in a match room via `statePatch` events.

### Key Directories

```
src/
  app/                  # Next.js App Router (27 route groups)
    api/                # API routes (REST)
    online/play/[id]/   # Multiplayer game page
    play/               # Local hotseat play
    draft-3d/           # 3D draft mode
    tournaments/        # Tournament pages
    tutorial/           # Tutorial pages
  components/
    game/               # Board, cards, HUD, overlays, combat
    ui/                 # Shared UI (dialogs, help, overlays)
    tutorial/           # Tutorial components
  lib/
    game/store/         # Zustand store (THE core of client state)
      types.ts          # GameState, CardRef, CellKey, Phase, etc.
      baseTypes.ts      # Phase, PlayerKey, Thresholds
      coreState.ts      # Turn management, phase control
      gameActions/      # Play actions, movement, combat
      customMessageHandlers.ts  # Card-specific resolvers
    tutorial/           # Tutorial engine, lessons, state adapter
    tournament/         # Pairing algorithm, standings
  hooks/                # Custom React hooks

server/
  index.ts              # Main Socket.IO server (~6k lines)
  modules/
    tournament/         # Tournament broadcast, standings
    draft/              # Draft config loading
  rules/                # Game rule validation

bots/engine/            # CPU bot AI (see bots/engine/README.md)
prisma/                 # Schema + migrations
data/                   # Card data, precons, bot params
public/                 # Static assets, manual.md, changelog.md
```

### Game State (Zustand Store)

The store is at `src/lib/game/store.ts`. Key state shape:

```typescript
// Core identifiers
matchId, actorKey, localPlayerId, currentPlayer, phase, turn

// Board (5x4 grid)
board: Record<CellKey, SiteTile>        // "x,y" -> site card
permanents: Record<CellKey, CardRef[]>  // units/artifacts on tiles
avatars: { p1: AvatarState, p2: AvatarState }

// Zones (per player)
zones: { p1: PlayerZones, p2: PlayerZones }
// Each has: hand, spellbook, atlas, graveyard, banished, collection

// Network
transport: Transport  // Socket.IO connection
lastServerTs          // Server timestamp for ordering
```

**CellKey format**: `"${x},${y}"` — e.g., `"2,0"` is column 2, row 0.
**Board**: 5 columns (0-4) x 4 rows (0-3). Row 0 = P2 home, row 3 = P1 home.
**Phases**: Setup -> Start -> Draw -> Main -> End (repeat).

### Socket.IO Events

**Client -> Server**: `hello`, `action`, `mulliganDone`, `joinMatch`, `leaveMatch`, `resyncRequest`, `interaction:request`, `interaction:response`, `message`, `ping`, draft events (`draft:session:join`, `chooseDraftPack`, `makeDraftPick`, `submitDeck`, `startDraft`)

**Server -> Client**: `welcome`, `statePatch`, `matchStarted`, `joinedLobby`, `draftUpdate`, `resyncResponse`, `interaction:request`, `interaction:response`, tournament broadcasts (`PHASE_CHANGED`, `ROUND_STARTED`, `DRAFT_READY`, `MATCH_ASSIGNED`, etc.)

### Database (Prisma)

46 models. Key groups:

- **Cards**: `Card`, `CardSetMetadata`, `Variant`, `Set`, `PackConfig`
- **Users**: `User`, `Account`, `Session`, `PasskeyCredential`, `Friendship`
- **Decks/Cubes**: `Deck`, `DeckCard`, `Cube`, `CubeCard`, `CollectionCard`
- **Matches**: `OnlineMatchSession`, `OnlineMatchAction`, `MatchResult`
- **Tournaments**: `Tournament`, `TournamentRound`, `Match`, `PlayerStanding`, `TournamentRegistration`
- **Drafts**: `DraftSession`, `DraftParticipant`

Schema at `prisma/schema.prisma`. Generate client with `npm run prisma:generate`.

## Conventions

### TypeScript

- **Strict mode** — all strict options enabled
- **No `any` types** — use interfaces, generics, or `unknown` with type guards
- **No `as any` casts** — find the proper type or use a type guard
- **Prefer explicit environment-correct types** — when DOM and Node typings differ (for example timers), use the narrower browser/server type instead of relying on utility inference that may resolve to the wrong overload
- **Typecheck touched code before finishing** — at minimum run a focused typecheck or the repo typecheck when TypeScript files are edited, especially after changing effects, timers, sockets, or async control flow
- **Import order** — external libs first, then `@/` sorted alphabetically, no blank lines between groups
- **`prefer-const`** and **`object-shorthand`** enforced by ESLint

### File Organization

- Components go in `src/components/{category}/`
- Game state slices go in `src/lib/game/store/`
- API routes use Next.js App Router convention: `src/app/api/{route}/route.ts`
- Tests go adjacent to source: `foo.test.ts` next to `foo.ts`
- Path alias: `@/*` maps to `src/*` (see `tsconfig.json`)

### 3D Rendering

- Each screen/page has its own `<Canvas>` (no shared global canvas)
- Card textures use KTX2 compression with TTL-based caching
- drei library for common 3D helpers
- Target 60fps on desktop, functional on mobile

### State Mutation

- Client: mutate Zustand store via actions in store slices
- Online: send `action` event to server, server validates and broadcasts `statePatch`
- Never mutate state directly in components — always go through store actions

## Commands

```bash
npm run dev              # Next.js dev server (port 3000)
npm run server:dev       # Socket.IO server (port 3010)
npm run build            # Production build
npm run test             # Run tests (Vitest)
npm run lint             # ESLint check
npm run prisma:generate  # Regenerate Prisma client
npm run prisma:migrate:dev  # Create/apply migrations
npm run db:up / db:down  # Start/stop local Postgres (Docker)
npm run db:seed          # Seed cards and packs
npm run stack:up         # Full Docker stack (Postgres + Redis + servers)
```

## Common Tasks

### Adding a new game action

1. Define the action type in `src/lib/game/store/types.ts`
2. Add the handler in the appropriate file under `src/lib/game/store/gameActions/`
3. Add server-side validation in `server/rules/` if needed
4. Flow: client store action -> `transport.send('action', ...)` -> server validates -> server broadcasts `statePatch` -> all clients apply patch

### Adding a card-specific resolver

Custom resolvers handle cards with unique abilities. Add to `src/lib/game/store/customMessageHandlers.ts`. Cards with resolvers get a purple glow indicator in the UI.

### Adding an API route

Create `src/app/api/{your-route}/route.ts` with exported HTTP method handlers (`GET`, `POST`, etc.). Use Prisma for DB access, NextAuth `getServerSession()` for auth.

### Database changes

1. Edit `prisma/schema.prisma`
2. `npm run prisma:migrate:dev -- --name your_change`
3. `npm run prisma:generate`

### Adding a tutorial lesson

1. Create `src/lib/tutorial/lessons/lesson-XX-topic.ts`
2. Register in `src/lib/tutorial/lessons/index.ts`
3. Step types: `narration`, `highlight`, `forced_action`, `scripted_action`, `checkpoint`
4. State patches are applied when _leaving_ a step (on `advance()`)

## Card Data

- Full card DB: `data/cards_raw.json` (2.27MB, all cards across sets)
- Bot card lookup: `data/bots/card-lookup.json` (rather use the official db as this lookup table holds an interpretation of rules which might deviate from the actual rules)
- 204 Site cards, 34 Avatar cards — always verify names against these files
- Rulebook: `reference/SorceryRulebook.txt` is authoritative for gameplay rules and should be used whenever keywords or game actions/concepts are referenced
- Codex: `reference/codex-*.csv` for errata and rules clarifications
- Validation: `npm run validate:cards` to check DB against card data files

## Environment

See `.env.example` for all configuration. Key variables for development:

- `DATABASE_URL` / `DIRECT_URL` — PostgreSQL connection
- `NEXT_PUBLIC_WS_URL` — Socket.IO server URL
- `NEXTAUTH_SECRET` — Auth token signing
- Feature flags: `NEXT_PUBLIC_CPU_BOTS_ENABLED`, `NEXT_PUBLIC_FEATURE_TOURNAMENTS`, etc.

## What Not to Do

- Don't add `any` types or `as any` casts
- Don't create new documentation files unless explicitly asked
- Don't add speculative features beyond what's requested
- Don't skip TypeScript strict checks
- Don't use `io.emit()` for game events (use room-scoped `io.to(room).emit()`)
- Don't write directly to the database from client components (use API routes)
- Don't commit `.env` files or secrets

## Styleguide

- Modern, sleek style preferred but if we can work in some whimsy that is appreciated
- Official Sorcery font is "Font Fantaisie Artistique", we should use it with Titles and Card names for example
- Never use emoji, but feel free to use fantasy themed icons from @iconify-json/game-icons where needed
- When referencing Mana cost, we should use our mana cost component @/components/game/manacost
- When referencing elements, element treshold, or affinity we should use the png assets for them
