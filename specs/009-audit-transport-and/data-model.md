# Data Model: Tournament Flow & Server Architecture

**Feature**: 009-audit-transport-and
**Date**: 2025-01-11

## Overview

This refactoring maintains existing data models but clarifies relationships and adds integrity constraints to prevent race conditions.

---

## Core Entities

### TournamentBroadcastEvent

**Purpose**: Track socket events for debugging and deduplication

**Fields**:
- `id`: string (UUID)
- `tournamentId`: string (tournament identifier)
- `eventType`: enum (`PHASE_CHANGED`, `TOURNAMENT_UPDATED`, `DRAFT_READY`, `ROUND_STARTED`, `MATCHES_READY`)
- `payload`: JSON (event data)
- `timestamp`: DateTime (when emitted)
- `emittedBy`: string (server process ID or API route)
- `roomTarget`: string (Socket.IO room, e.g., `tournament:123`)

**Relationships**:
- Belongs to Tournament (via `tournamentId`)

**Validation Rules**:
- `eventType` must be valid enum value
- `timestamp` auto-generated on creation
- `tournamentId` must exist in database

**State Transitions**: None (immutable audit log)

**Indexes**:
- `(tournamentId, timestamp)` - for querying recent events
- `(eventType, timestamp)` - for monitoring event volume

---

### DraftConfiguration

**Purpose**: Unified draft configuration model (eliminates DraftSession vs Match.draftConfig split)

**Fields**:
- `matchId`: string (unique, references Match)
- `tournamentId`: string? (optional, for tournament drafts)
- `cubeId`: string? (optional, for cube drafts)
- `setMix`: string[] (for set-based drafts, e.g., `['Beta', 'Unlimited']`)
- `packCount`: number (default: 3)
- `packSize`: number (default: 15)
- `timePerPick`: number? (seconds, optional)
- `deckBuildingTime`: number? (minutes, optional)
- `loadedAt`: DateTime (when hydrated from DraftSession)

**Relationships**:
- Belongs to Match (1:1)
- Optionally belongs to Tournament (via `tournamentId`)
- References Cube (via `cubeId`)

**Validation Rules**:
- If `tournamentId` exists, must match Match's `tournamentId`
- Exactly one of `cubeId` or `setMix` must be set (not both, not neither)
- `packCount` must be 1-10
- `packSize` must be 5-30

**State Transitions**: None (configuration is immutable once loaded)

---

### PlayerStanding (Enhanced)

**Purpose**: Player's tournament standing with integrity constraints

**Fields** (existing):
- `id`: string (UUID)
- `tournamentId`: string
- `playerId`: string
- `wins`: number (default: 0)
- `losses`: number (default: 0)
- `draws`: number (default: 0)
- `matchPoints`: number (default: 0)
- `gameWinPercentage`: number? (calculated)
- `opponentWinPercentage`: number? (calculated)
- `currentMatchId`: string? (optional)
- `updatedAt`: DateTime (auto-updated)

**New Constraints**:
- Unique index on `(tournamentId, playerId)`
- Check constraint: `wins >= 0 AND losses >= 0 AND draws >= 0`
- Check constraint: `matchPoints = (wins * 3) + draws`
- Foreign key: `currentMatchId` references Match.id (nullable)

**Relationships**:
- Belongs to Tournament
- Belongs to Player (User)
- Optionally linked to current Match

**Validation Rules**:
- `matchPoints` must equal `(wins * 3) + draws` (enforced by database trigger or app logic)
- `gameWinPercentage` must be 0.0-1.0
- `opponentWinPercentage` must be 0.0-1.0

**State Transitions**:
- `updatedAt` automatically set on any field change
- `currentMatchId` set when match assigned, cleared when match completes

---

### SocketBroadcastHealth

**Purpose**: Monitor broadcast failures and retry attempts

**Fields**:
- `id`: string (UUID)
- `timestamp`: DateTime
- `eventType`: string
- `tournamentId`: string?
- `targetUrl`: string (e.g., `http://localhost:3010/tournament/broadcast`)
- `success`: boolean
- `statusCode`: number? (HTTP status)
- `errorMessage`: string? (if failed)
- `retryCount`: number (0 for first attempt)
- `latencyMs`: number

**Relationships**: None (monitoring data)

**Validation Rules**:
- If `success = false`, `errorMessage` should be populated
- `retryCount` must be >= 0

**Usage**: Query this table to identify broadcast failures, track retry patterns, alert on high failure rates

---

## Derived Data

### StandingUpdate (Internal Type)

**Purpose**: Atomic standings update operation (not persisted, used in transactions)

**Fields**:
- `playerId`: string
- `tournamentId`: string
- `winDelta`: number (1, 0, or -1)
- `lossDelta`: number (1, 0, or -1)
- `drawDelta`: number (1, 0, or -1)
- `matchPointsDelta`: number (3 for win, 1 for draw, 0 for loss)

**Usage**: Passed to `standings.recordMatchResult()` to ensure atomic updates

---

## Relationships Diagram

```
Tournament
  ├── PlayerStanding (1:many)
  │     └── currentMatch (1:1 optional)
  ├── TournamentRound (1:many)
  │     └── Match (1:many)
  │           └── DraftConfiguration (1:1 optional)
  │                 └── Cube (many:1 optional)
  └── TournamentBroadcastEvent (1:many, audit only)

SocketBroadcastHealth (independent, monitoring only)
```

---

## State Transitions

### PlayerStanding State Machine

```
[Registered]
    ↓
[Waiting] (wins=0, losses=0, draws=0, matchPoints=0)
    ↓
[Active] (currentMatchId assigned)
    ↓ (match completes)
[Updated] (wins/losses/draws incremented, matchPoints recalculated)
    ↓ (tournament ends)
[Final] (standings locked)
```

**Transitions**:
1. **Registered → Waiting**: When player joins tournament
2. **Waiting → Active**: When match assigned (`currentMatchId` set)
3. **Active → Updated**: When match result submitted (atomic transaction)
4. **Updated → Active**: When next match assigned (repeats for each round)
5. **Updated → Final**: When tournament completes

---

## Data Integrity Constraints

### Constraint 1: Atomic Standings Updates

**Rule**: Winner and loser standings must update in a single transaction

**Implementation**:
```typescript
await prisma.$transaction([
  prisma.playerStanding.update({ where: { winnerId }, data: { wins: { increment: 1 }, matchPoints: { increment: 3 } } }),
  prisma.playerStanding.update({ where: { loserId }, data: { losses: { increment: 1 } } }),
]);
```

**Violation Handling**: If transaction fails, log error and DO NOT mark match as completed

---

### Constraint 2: Draft Configuration Completeness

**Rule**: Match with `matchType = 'draft'` MUST have `DraftConfiguration` before draft starts

**Implementation**:
```typescript
async function ensureDraftConfig(matchId: string): Promise<DraftConfiguration> {
  const config = await loadDraftConfiguration(matchId);
  if (!config) throw new Error(`No draft configuration for match ${matchId}`);
  if (!config.cubeId && !config.setMix?.length) {
    throw new Error(`Draft configuration incomplete: missing cubeId or setMix`);
  }
  return config;
}
```

**Violation Handling**: Prevent draft from starting, log error, notify tournament organizer

---

### Constraint 3: Event Deduplication

**Rule**: Same event should not be emitted twice within 5 seconds

**Implementation** (in-memory):
```typescript
const recentEvents = new Map<string, number>(); // eventId → timestamp

function shouldEmit(tournamentId: string, eventType: string, payload: object): boolean {
  const eventId = `${tournamentId}:${eventType}:${JSON.stringify(payload)}`;
  const now = Date.now();
  const lastEmitted = recentEvents.get(eventId);

  if (lastEmitted && (now - lastEmitted) < 5000) {
    console.warn('[Broadcast] Duplicate event prevented:', eventId);
    return false;
  }

  recentEvents.set(eventId, now);
  return true;
}
```

**Violation Handling**: Skip duplicate emission, log warning

---

## Migration Impact

### Schema Changes Required

**New Tables**:
1. `TournamentBroadcastEvent` (audit log)
2. `SocketBroadcastHealth` (monitoring)

**Modified Tables**:
1. `PlayerStanding`:
   - Add check constraint: `matchPoints = (wins * 3) + draws`
   - Add index: `(tournamentId, updatedAt)` for recent updates query

**No Breaking Changes**: All existing queries continue to work

---

## Validation Examples

### Valid: Tournament Draft with Cube

```typescript
{
  matchId: "match_123",
  tournamentId: "tournament_456",
  cubeId: "cube_789",
  setMix: null,  // Not used for cube drafts
  packCount: 3,
  packSize: 15,
  timePerPick: 90,
  deckBuildingTime: 30,
  loadedAt: "2025-01-11T10:00:00Z"
}
```

### Valid: Casual Draft with Set Mix

```typescript
{
  matchId: "match_123",
  tournamentId: null,  // Casual match
  cubeId: null,
  setMix: ["Beta", "Unlimited", "Beta"],
  packCount: 3,
  packSize: 15,
  timePerPick: null,
  deckBuildingTime: null,
  loadedAt: "2025-01-11T10:00:00Z"
}
```

### Invalid: Missing Both Cube and Set Mix

```typescript
{
  matchId: "match_123",
  cubeId: null,
  setMix: [],  // ERROR: Must have either cubeId or setMix
  packCount: 3,
  packSize: 15
}
// Validation Error: "Draft configuration must specify cubeId or setMix"
```

### Invalid: Match Points Don't Match Wins/Draws

```typescript
{
  tournamentId: "tournament_123",
  playerId: "player_456",
  wins: 2,
  draws: 1,
  losses: 0,
  matchPoints: 5  // ERROR: Should be (2*3) + 1 = 7
}
// Database Constraint Violation: "matchPoints must equal (wins * 3) + draws"
```

---

## Performance Considerations

### Index Strategy

**PlayerStanding**:
- Primary: `(tournamentId, playerId)` - unique composite key
- Secondary: `(tournamentId, matchPoints DESC)` - for standings queries
- Tertiary: `(currentMatchId)` - for active match lookups

**TournamentBroadcastEvent**:
- Primary: `id` (UUID)
- Secondary: `(tournamentId, timestamp DESC)` - for audit queries
- TTL: Delete events older than 30 days (reduce table size)

**SocketBroadcastHealth**:
- Primary: `id` (UUID)
- Secondary: `(timestamp DESC)` - for monitoring queries
- Partial index: `(success = false)` - for failure analysis
- TTL: Delete records older than 7 days

---

## Error Handling

### Database Transaction Failures

**Scenario**: Prisma transaction fails during standings update

**Handling**:
```typescript
try {
  await prisma.$transaction([...]);
} catch (err) {
  if (err.code === 'P2034') {
    // Transaction conflict - retry once
    await new Promise(resolve => setTimeout(resolve, 100));
    return recordMatchResult(tournamentId, winnerId, loserId, isDraw);
  }

  // Log error to monitoring
  console.error('[Standings] Transaction failed:', {
    tournamentId, winnerId, loserId, isDraw, error: err.message
  });

  // Record failure in health table
  await prisma.socketBroadcastHealth.create({
    data: {
      eventType: 'STANDINGS_UPDATE',
      tournamentId,
      success: false,
      errorMessage: err.message,
    }
  });

  // Re-throw for caller to handle
  throw new Error(`Failed to update standings: ${err.message}`);
}
```

---

## Testing Scenarios

### Scenario 1: Concurrent Standings Updates

**Setup**:
1. Create tournament with 4 players (P1, P2, P3, P4)
2. Create 2 matches: M1 (P1 vs P2), M2 (P3 vs P4)

**Action**:
```typescript
await Promise.all([
  recordMatchResult(tournamentId, P1, P2, false),  // P1 wins
  recordMatchResult(tournamentId, P3, P4, false),  // P3 wins
]);
```

**Expected**:
- P1: wins=1, matchPoints=3
- P2: losses=1, matchPoints=0
- P3: wins=1, matchPoints=3
- P4: losses=1, matchPoints=0

**Validation**:
```sql
SELECT playerId, wins, losses, matchPoints
FROM PlayerStanding
WHERE tournamentId = ?
ORDER BY playerId;
```

**Failure Mode**: If not transactional, one player's update may be lost

---

### Scenario 2: Draft Config Hydration

**Setup**:
1. Create tournament draft with cube
2. DraftSession created with `cubeId = "cube_123"`
3. Match created with `matchId = "match_456"`

**Action**:
```typescript
const config = await getDraftConfig("match_456");
```

**Expected**:
```typescript
{
  matchId: "match_456",
  cubeId: "cube_123",
  packCount: 3,
  packSize: 15,
  loadedAt: <timestamp>
}
```

**Validation**:
- `config.cubeId` must not be `undefined`
- `config.cubeId` must match DraftSession.settings.cubeId

**Failure Mode**: If hydration skipped, `cubeId` is `undefined` → wrong pack generation

---

### Scenario 3: Event Deduplication

**Setup**:
1. Tournament transitions to "active" phase
2. API calls `broadcastPhaseChanged(tournamentId, 'active')`

**Action** (simulate duplicate):
```typescript
emitPhaseChanged(tournamentId, 'active', { roundNumber: 1 });
await sleep(100);
emitPhaseChanged(tournamentId, 'active', { roundNumber: 1 });  // Duplicate
```

**Expected**:
- First call: Event emitted, logged
- Second call: Skipped (duplicate detected), warning logged

**Validation**:
```typescript
const events = await prisma.tournamentBroadcastEvent.findMany({
  where: { tournamentId, eventType: 'PHASE_CHANGED' }
});
expect(events).toHaveLength(1);  // Only one event persisted
```

**Failure Mode**: If no deduplication, clients receive duplicate events → request loops

---

## Summary

This data model enhances existing entities with:
- **Atomic Updates**: Transaction-based standings updates prevent race conditions
- **Configuration Integrity**: Unified draft configuration ensures cube ID is always available
- **Audit Trail**: Broadcast event logging enables debugging and deduplication
- **Health Monitoring**: Track broadcast failures to identify production issues

All changes are backward-compatible with existing queries. New constraints prevent the identified bugs while maintaining API compatibility.
