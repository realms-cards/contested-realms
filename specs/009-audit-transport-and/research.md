# Research Findings: Tournament Flow & Server Architecture

**Feature**: 009-audit-transport-and
**Date**: 2025-01-11
**Status**: Complete

## Executive Summary

Investigation reveals **critical architectural issues** causing production bugs:

1. **Dual Broadcasting Pattern**: Events emitted to room + globally → request loops
2. **Draft Configuration Race**: Cube ID not loaded before pack generation
3. **Standings Race Conditions**: Non-transactional updates cause data loss
4. **Environment Configuration**: Silent failures when production URLs misconfigured
5. **6,329-line Server File**: Mixed responsibilities, code duplication, poor testability

## Problem Analysis

### Issue 1: Manual Reload Required for Draft Start

**Root Cause**: PHASE_CHANGED events broadcast globally AND to tournament room

**Location**: `server/index.js:4129-4138`
```javascript
function broadcastPhaseChanged(tournamentId, newPhase, additionalData = {}) {
  io.to(`tournament:${tournamentId}`).emit("PHASE_CHANGED", payload);
  io.emit("PHASE_CHANGED", payload);  // ← GLOBAL BROADCAST
}
```

**Flow**:
1. API calls `broadcastPhaseChanged` → emits 2x per call
2. Client receives event → triggers callback
3. Callback refetches data → may trigger another broadcast
4. **Loop continues** → client misses critical DRAFT_READY event

**Evidence**: All broadcast functions in Lines 4129-4190 follow this pattern

**Fix Strategy**: Remove all `io.emit()` global broadcasts, use room-only emissions

---

### Issue 2: Cube Drafts Broken in Production

**Root Cause**: Draft configuration hydration timing mismatch

**Tournament Draft Flow**:
1. `DraftSession` created with `cubeId` in settings (API route)
2. `Match` created in database (separate table)
3. `hydrateMatchFromDatabase` loads `cubeId` into `match.draftConfig`
4. `leaderStartDraft` uses `cubeId` to generate packs

**Problem**: Step 3 only runs when match is loaded from database. In production with Redis caching or in-memory state, hydration may be skipped.

**Location**:
- Hydration: `server/index.js:3647-3676`
- Draft start: `server/index.js:543-544`

```javascript
// If match already in memory, cubeId is missing:
const usingCube = Boolean(dc.cubeId);  // ← undefined in production
if (usingCube) {
  picks = await generateCubeBoosterDeterministic(dc.cubeId, ...);
} else {
  picks = await generateBoosterDeterministic(setName, ...);  // ← WRONG PATH
}
```

**Why Local Works**: Local dev restarts server frequently → matches always load from DB → hydration runs

**Why Production Fails**: Long-running server → matches cached in memory → hydration skipped

**Fix Strategy**: Force hydration before `leaderStartDraft`, or pass `cubeId` in draft start request

---

### Issue 3: Standings Not Recorded

**Root Cause**: Race condition in parallel match completions + non-transactional updates

**Location**: `server/index.js:2370-2382`

**Scenario**:
```
Time  Match A                          Match B
-----------------------------------------------------------
T0    Completes
T1    Updates player1 (wins=5→6)       Completes
T2                                     Reads player1 (wins=5)
T3    Commits (wins=6)
T4                                     Updates player1 (wins=5→6)
T5                                     Commits (OVERWRITES to wins=6)
Result: Player got 2 wins but only 1 recorded
```

**Code**:
```javascript
try {
  // NO TRANSACTION WRAPPER
  await prisma.playerStanding.update({
    where: { tournamentId_playerId: { tournamentId: t, playerId: winner } },
    data: { wins: { increment: 1 }, matchPoints: { increment: 3 } },
  });
  await prisma.playerStanding.update({
    where: { tournamentId_playerId: { tournamentId: t, playerId: loser } },
    data: { losses: { increment: 1 } },
  });
} catch {}  // ← SILENT FAILURE
```

**Additional Issues**:
- Empty catch block swallows errors
- No logging of failures
- `updateMany` for draws, `update` for wins/losses (inconsistent)

**Fix Strategy**: Wrap in Prisma transaction, add error logging, validate before updating

---

### Issue 4: Server Architecture Problems

**Metrics**:
- **File Size**: 6,329 lines (single file)
- **Functions**: 100+ functions
- **Socket Events**: 75+ event handlers
- **Responsibilities**: Lobbies + Matches + Drafts + Tournaments + Leaderboard

**Identified Modules** (extraction candidates):

| Module | Lines | Functions | Priority |
|--------|-------|-----------|----------|
| Tournament Broadcast | 60 | 10 | HIGH (fixes loops) |
| Draft System | 750 | 20 | HIGH (fixes cube issue) |
| Standings Management | 200 | 8 | HIGH (fixes races) |
| Match Lifecycle | 1,430 | 30 | MEDIUM |
| Lobby Management | 310 | 15 | MEDIUM |
| Leaderboard | 311 | 8 | LOW |
| Interaction System | 397 | 15 | LOW |

**Code Duplication Examples**:

1. **Broadcast Pattern** (10+ occurrences):
```javascript
function broadcastXXX(tournamentId, data) {
  io.to(`tournament:${tournamentId}`).emit("XXX", data);
  io.emit("XXX", data);  // Duplicated in every broadcast function
}
```

2. **Player Lookup** (4+ implementations):
- `getPlayerInfo`
- `getPlayerBySocket`
- `ensurePlayerCached`
- `isPlayerConnected`

3. **Match Loading** (3+ paths):
- `getOrLoadMatch`
- `recoverActiveMatches`
- `findActiveMatchForPlayer`

**Fix Strategy**: Extract modules one-by-one, starting with broadcast layer

---

## Technology Decisions

### Decision 1: Surgical Refactoring Approach

**Rationale**: Feature-complete system with production users. Cannot risk rewriting entire server.

**Strategy**:
- Extract modules as new files, import into main server
- Maintain 100% behavioral compatibility
- Add tests BEFORE extraction (prevent regressions)
- Extract high-priority modules first (broadcast, draft, standings)

**Alternatives Considered**:
- ❌ Full rewrite: Too risky, no incremental progress
- ❌ Leave as-is: Technical debt compounds, bugs persist
- ✅ Incremental extraction: Safe, testable, reversible

---

### Decision 2: Transaction Wrapper for Standings

**Rationale**: Prisma supports transactions, zero external dependencies

**Implementation**:
```typescript
await prisma.$transaction([
  prisma.playerStanding.update({ where: { winner }, data: { wins: { increment: 1 } } }),
  prisma.playerStanding.update({ where: { loser }, data: { losses: { increment: 1 } } }),
]);
```

**Alternatives Considered**:
- ❌ Optimistic locking: Requires schema changes, retry logic
- ❌ Redis locks: Adds external dependency
- ✅ Database transaction: Native solution, ACID guarantees

---

### Decision 3: Event Deduplication via Request ID

**Rationale**: Prevents client-side request loops without server changes

**Implementation**:
```typescript
const eventId = `${tournamentId}:${newPhase}:${timestamp}`;
if (lastEventId === eventId) return; // Ignore duplicate
lastEventId = eventId;
```

**Alternatives Considered**:
- ❌ Server-side dedup: Requires state management, doesn't fix root cause
- ❌ Debouncing only: Delays events, doesn't prevent loops
- ✅ Client-side dedup + remove global broadcasts: Fixes root cause + prevents symptoms

---

### Decision 4: Environment Validation Script

**Rationale**: Production failures caused by missing/incorrect environment variables

**Requirements**:
- Check `SOCKET_SERVER_URL` matches deployment
- Validate `NEXT_PUBLIC_WS_URL` reachable from client
- Ensure `NEXT_PUBLIC_APP_URL` set for CORS
- Run in CI/CD before deployment

**Implementation**: Bash script that curls endpoints, verifies responses

**Alternatives Considered**:
- ❌ Runtime checks: Too late (users already affected)
- ❌ Manual verification: Error-prone
- ✅ Automated pre-deployment checks: Catches issues early

---

## Technical Constraints

**Language/Version**: TypeScript 5.x, Node.js 18+
**Dependencies**: Socket.IO 4.x, Prisma 5.x, Next.js 15.x
**Storage**: PostgreSQL (via Prisma), Redis (for caching)
**Testing**: Vitest for unit tests, Playwright for E2E
**Deployment**: Vercel (Next.js), separate Socket.IO server
**Performance Goals**: <100ms broadcast latency, <5s standings update
**Constraints**: Zero downtime deployment, backward compatible socket events
**Scale**: 100+ concurrent users, 32-player tournaments

---

## Critical Findings

### Finding 1: Global Broadcast Antipattern

**Impact**: ALL clients receive ALL tournament events (including unrelated tournaments)

**Evidence**:
- `io.emit("PHASE_CHANGED", payload)` - Line 4138
- `io.emit("TOURNAMENT_UPDATED", payload)` - Line 4157
- `io.emit("ROUND_STARTED", payload)` - Line 4168
- `io.emit("MATCHES_READY", payload)` - Line 4181
- `io.emit("DRAFT_READY", payload)` - Line 4190

**Consequences**:
- Lobby pages re-render on every tournament update (performance)
- Clients trigger API calls when they receive events (request loops)
- Bandwidth waste (events sent to clients that don't need them)

**Fix**: Change all to `io.to(`tournament:${tournamentId}`).emit(...)`

---

### Finding 2: HTTP Broadcast Failure Modes

**Current Architecture**:
```
API Route → HTTP POST → Socket.IO Server → WebSocket → Clients
```

**Failure Points**:
1. `SOCKET_SERVER_URL` environment variable missing/wrong
2. Socket server not running (separate process)
3. Network issue between Next.js and Socket server
4. Request timeout (no retry logic)

**Current Handling**:
```typescript
try {
  await fetch(`${SOCKET_SERVER_URL}/tournament/broadcast`, { ... });
} catch (err) {
  console.warn(`Broadcast failed for ${event}:`, err);  // ← SILENT FAILURE
}
```

**Impact**: Events lost, clients never update, users think system is broken

**Fix**: Add retry logic, logging, health checks

---

### Finding 3: Draft Session vs Match Config Mismatch

**Two Data Models for Draft Configuration**:

1. **DraftSession** (tournament drafts):
```prisma
model DraftSession {
  id        String
  tournamentId String?
  settings  Json  // Contains: { cubeId, timePerPick, ... }
  packConfiguration Json
}
```

2. **Match.draftConfig** (in-memory):
```typescript
interface Match {
  id: string;
  draftConfig?: {
    cubeId?: string;
    setMix?: string[];
    packCount?: number;
  };
}
```

**Problem**: Draft logic uses `match.draftConfig.cubeId`, but tournament creates `DraftSession.settings.cubeId`. Hydration copies DraftSession → match.draftConfig, but only runs on DB load.

**Fix**: Either (1) always hydrate before draft start, or (2) query DraftSession directly in draft logic

---

### Finding 4: Client Retry Loops

**Location**: `TournamentDraft3DScreen.tsx:152-259`

**Current Logic**:
```typescript
// Poll every 500ms until joined
const id = window.setInterval(() => {
  if (joinSentRef.current) { clearInterval(id); return; }
  tryJoin();  // Emits draft:session:join
}, 500);

// Each join attempt also has 3s timeout to retry
joinAckTimeoutRef.current = setTimeout(() => {
  if (!joinSentRef.current) tryJoin();
}, 3000);
```

**Problem**: Two retry mechanisms running simultaneously:
- 500ms interval keeps trying
- 3s timeout also retries
- No exponential backoff
- No max retry limit

**Impact**: Server receives 100+ join requests from single client

**Fix**: Single retry mechanism with exponential backoff, max 5 attempts

---

## Proposed Solutions

### Solution 1: Broadcast Module Extraction

**File**: `server/modules/tournament/broadcast.js`

**Interface**:
```typescript
export function emitPhaseChanged(tournamentId: string, newPhase: string, data?: object): void;
export function emitTournamentUpdate(tournamentId: string, data: object): void;
export function emitDraftReady(tournamentId: string, sessionId: string): void;
export function emitRoundStarted(tournamentId: string, roundNumber: number): void;
export function emitMatchesReady(tournamentId: string, matches: Match[]): void;
```

**Implementation**:
- All functions use `io.to(`tournament:${tournamentId}`)` ONLY
- No global broadcasts
- Add request deduplication (track last N event IDs)
- Add logging of all emissions

**Migration**:
1. Create new file with functions
2. Update server/index.js to import and use new functions
3. Remove old `broadcastXXX` functions
4. Test with existing integration tests

---

### Solution 2: Draft Configuration Service

**File**: `server/modules/draft/config.js`

**Interface**:
```typescript
export async function getDraftConfig(matchId: string): Promise<DraftConfig>;
export async function loadCubeConfiguration(cubeId: string): Promise<CubeConfig>;
export async function ensureMatchHydrated(matchId: string): Promise<void>;
```

**Implementation**:
- Always query `DraftSession` if `match.tournamentId` exists
- Cache config in match object after loading
- Add logging when cube config loaded

**Migration**:
1. Create service module
2. Call `ensureMatchHydrated` at start of `leaderStartDraft`
3. Remove hydration logic from `getOrLoadMatch`
4. Add unit tests for config loading

---

### Solution 3: Standings Transaction Wrapper

**File**: `server/modules/tournament/standings.js`

**Interface**:
```typescript
export async function recordMatchResult(
  tournamentId: string,
  winnerId: string,
  loserId: string,
  isDraw: boolean
): Promise<void>;

export async function updateStandings(
  tournamentId: string,
  updates: StandingUpdate[]
): Promise<void>;
```

**Implementation**:
```typescript
export async function recordMatchResult(tournamentId, winnerId, loserId, isDraw) {
  return prisma.$transaction(async (tx) => {
    if (isDraw) {
      await tx.playerStanding.updateMany({
        where: { tournamentId, playerId: { in: [winnerId, loserId] } },
        data: { draws: { increment: 1 }, matchPoints: { increment: 1 } },
      });
    } else {
      await tx.playerStanding.update({
        where: { tournamentId_playerId: { tournamentId, playerId: winnerId } },
        data: { wins: { increment: 1 }, matchPoints: { increment: 3 } },
      });
      await tx.playerStanding.update({
        where: { tournamentId_playerId: { tournamentId, playerId: loserId } },
        data: { losses: { increment: 1 } },
      });
    }

    // Log success
    console.log('[Standings] Updated:', { tournamentId, winnerId, loserId, isDraw });
  });
}
```

**Error Handling**:
- Catch transaction errors
- Log to monitoring system
- Retry once on conflict
- Return error to caller (don't swallow)

---

### Solution 4: Client Event Deduplication

**File**: `src/hooks/useTournamentSocket.ts`

**Implementation**:
```typescript
const lastEventIds = useRef<Set<string>>(new Set());

const handlePhaseChanged = useCallback((data: PhaseChangedEvent) => {
  const eventId = `${data.tournamentId}:${data.newPhase}:${data.timestamp}`;

  if (lastEventIds.current.has(eventId)) {
    console.debug('[useTournamentSocket] Ignoring duplicate event:', eventId);
    return;
  }

  lastEventIds.current.add(eventId);

  // Keep only last 100 events
  if (lastEventIds.current.size > 100) {
    const first = lastEventIds.current.values().next().value;
    lastEventIds.current.delete(first);
  }

  // Process event
  onPhaseChanged?.(data);
}, [onPhaseChanged]);
```

---

## Environment Configuration

### Required Environment Variables

**Production**:
```bash
# Socket.IO Server URL (for server-side HTTP broadcasts)
SOCKET_SERVER_URL=https://socket.example.com

# Client WebSocket URL (for browser connections)
NEXT_PUBLIC_WS_URL=https://socket.example.com

# App URL (for CORS)
NEXT_PUBLIC_APP_URL=https://app.example.com

# WebSocket path (default: /socket.io)
NEXT_PUBLIC_WS_PATH=/socket.io

# Transports (comma-separated)
NEXT_PUBLIC_WS_TRANSPORTS=websocket,polling
```

**Validation Script**:
```bash
#!/bin/bash
# scripts/validate-socket-env.sh

if [ -z "$SOCKET_SERVER_URL" ]; then
  echo "ERROR: SOCKET_SERVER_URL not set"
  exit 1
fi

if ! curl -f "$SOCKET_SERVER_URL/health" > /dev/null 2>&1; then
  echo "ERROR: Socket server not reachable at $SOCKET_SERVER_URL"
  exit 1
fi

echo "✓ Socket environment valid"
```

---

## Testing Requirements

### Unit Tests

**Broadcast Module**:
- ✓ `emitPhaseChanged` only emits to tournament room
- ✓ Event deduplication prevents duplicate emissions
- ✓ Event logging records all emissions

**Draft Config Service**:
- ✓ `getDraftConfig` loads from DraftSession when `tournamentId` exists
- ✓ `getDraftConfig` returns match config when no tournament
- ✓ Cube configuration loaded correctly

**Standings Module**:
- ✓ `recordMatchResult` updates both players atomically
- ✓ Draw increments both players' draws and match points
- ✓ Win/loss updates correct players
- ✓ Transaction rolls back on error

### Integration Tests

**Tournament Draft Flow**:
1. Create tournament with cube draft
2. Start tournament
3. Verify `PHASE_CHANGED` event received by participants only
4. Verify `DRAFT_READY` event received
5. Join draft session
6. Verify cube packs generated (not set packs)

**Standings Update Flow**:
1. Create tournament with 4 players
2. Create 2 matches for same round
3. Complete both matches simultaneously (parallel requests)
4. Verify all 4 players have correct standings
5. Verify no data loss

**Broadcast Reliability**:
1. Start tournament
2. Disconnect socket server
3. Verify API returns error
4. Reconnect socket server
5. Retry request
6. Verify event broadcast succeeds

---

## Migration Plan

### Phase 1: Critical Fixes (Week 1)
1. Remove global broadcasts (server/index.js)
2. Add transaction wrapper to standings (server/index.js)
3. Add environment validation script
4. Deploy to production

### Phase 2: Draft Fix (Week 2)
1. Create draft config service
2. Update `leaderStartDraft` to use service
3. Add unit tests
4. Deploy to production

### Phase 3: Module Extraction (Weeks 3-4)
1. Extract broadcast module
2. Extract standings module
3. Extract draft module
4. Add integration tests
5. Deploy to production

### Phase 4: Client Improvements (Week 5)
1. Add event deduplication
2. Fix retry loops in draft join
3. Add exponential backoff
4. Deploy to production

---

## References

**Key Files**:
- Server: `/Users/geleeroyale/CascadeProjects/sorcery-client/server/index.js`
- Broadcast Service: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/lib/services/tournament-broadcast.ts`
- Socket Hook: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/hooks/useTournamentSocket.ts`
- Draft Screen: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/components/game/TournamentDraft3DScreen.tsx`
- Start Route: `/Users/geleeroyale/CascadeProjects/sorcery-client/src/app/api/tournaments/[id]/start/route.ts`

**Line Numbers**:
- Global broadcast: server/index.js:4138
- Cube draft check: server/index.js:543-544
- Standings update: server/index.js:2370-2382
- Draft hydration: server/index.js:3647-3676
- Retry loop: TournamentDraft3DScreen.tsx:152-259
