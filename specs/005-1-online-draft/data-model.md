# Data Model: Online Draft Flow Improvements

**Date**: 2025-09-09  
**Feature**: Online Draft Flow Improvements  
**Branch**: `005-1-online-draft`

## Overview
This document defines the data structures and state management for synchronized draft mechanics, deck persistence, and waiting overlays in the online draft system.

## Core Entities

### DraftSession
Represents an active drafting game session with multiple players.

```typescript
interface DraftSession {
  sessionId: string;
  status: 'waiting' | 'drafting' | 'deck_building' | 'submitting' | 'complete';
  playerCount: number;
  maxPlayers: number;
  currentRound: number;
  currentPack: number;
  timeStarted: number;
  settings: DraftSettings;
  syncState: SyncState;
}

interface DraftSettings {
  packsPerPlayer: number;
  cardsPerPack: number;
  timePerPick: number; // seconds
  disconnectGracePeriod: number; // seconds
  format: 'standard' | 'limited' | 'custom';
}

interface SyncState {
  waitingForPlayers: string[]; // player IDs still picking
  readyPlayers: string[]; // player IDs who have picked
  lastSyncTimestamp: number;
  syncVersion: number; // increments with each state change
}
```

### PlayerDraftState
Tracks individual player progress and state within a draft session.

```typescript
interface PlayerDraftState {
  playerId: string;
  sessionId: string;
  playerName: string;
  seatPosition: number; // 0-7 for 8 players
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  lastActivityTimestamp: number;
  
  // Draft progress
  draftedCards: Card[];
  currentPack: Card[] | null;
  pickTimer: number | null; // seconds remaining
  hasPickedThisRound: boolean;
  
  // Deck building
  mainDeck: Card[];
  sideboard: Card[];
  deckStatus: 'editing' | 'submitted' | 'waiting';
  
  // Stats
  picksCompleted: number;
  averagePickTime: number;
  disconnections: number;
}

interface Card {
  cardId: string;
  name: string;
  set: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic';
  manaCost: string;
  type: string;
  imageUrl: string;
  variantId?: string;
  pickOrder?: number; // when it was picked in the draft
  source: 'draft' | 'standard' | 'sideboard';
}
```

### DeckSubmission
Represents a completed deck submission from a player.

```typescript
interface DeckSubmission {
  submissionId: string;
  sessionId: string;
  playerId: string;
  timestamp: number;
  
  mainDeck: Card[];
  sideboard: Card[];
  
  validation: DeckValidation;
  metadata: {
    totalCards: number;
    colorIdentity: string[];
    averageManaCost: number;
    curveData: { [cost: string]: number };
  };
}

interface DeckValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  minimumDeckSize: number;
  maximumDeckSize: number;
  sideboardLimit: number;
}
```

### PackState
Represents the current state of card packs being passed between players.

```typescript
interface PackState {
  packId: string;
  sessionId: string;
  roundNumber: number;
  packNumber: number;
  
  originalCards: string[]; // card IDs when pack was opened
  remainingCards: string[]; // current cards in pack
  pickedCards: PackPick[]; // audit trail
  
  currentHolder: string; // player ID who has this pack
  passDirection: 'left' | 'right'; // alternates each round
  isComplete: boolean;
}

interface PackPick {
  playerId: string;
  cardId: string;
  pickNumber: number;
  timestamp: number;
  timeToP 

}
```

### WaitingOverlayState
Manages the state of the waiting overlay during deck submission.

```typescript
interface WaitingOverlayState {
  sessionId: string;
  totalPlayers: number;
  submittedPlayers: PlayerSubmissionStatus[];
  waitingStartTime: number;
  estimatedTimeRemaining: number | null;
  
  displayMode: 'simple' | 'detailed' | 'timeout_warning';
  allowContinueWithoutAll: boolean;
  timeoutThreshold: number; // seconds before allowing continue
}

interface PlayerSubmissionStatus {
  playerId: string;
  playerName: string;
  status: 'editing' | 'submitted' | 'timeout' | 'disconnected';
  submittedAt?: number;
  lastActivity: number;
}
```

## State Transitions

### Draft Session States
```
waiting -> drafting -> deck_building -> submitting -> complete
         ↑                           ↓
         └── (if player rejoins) ────┘
```

### Player Connection States
```
connected -> disconnected -> reconnecting -> connected
                          ↓
                      (timeout) -> bot_controlled
```

### Deck Status States
```
editing -> submitted -> waiting
        ↓
    (recall) -> editing
```

## Validation Rules

### Pick Validation
- Player must own the current pack
- Card must exist in the pack
- Pick must be made within time limit
- Cannot pick after already picking this round

### Deck Submission Validation
- Minimum 40 cards in main deck (limited)
- Maximum 15 cards in sideboard
- All cards must be from draft pool or Standard Cards
- No duplicate cards beyond drafted copies

### Synchronization Rules
- All players must pick before pack rotation
- Server authoritative for all state changes
- Client predictions rolled back on conflicts
- Maximum 3 retry attempts for failed syncs

## Event Flow

### Pick and Pass Sequence
1. Player selects card from pack
2. Client sends `draft:pick_card` event
3. Server validates pick
4. Server updates PackState
5. Server checks if all players have picked
6. If yes: Server rotates packs, broadcasts `draft:sync_state`
7. If no: Server broadcasts `draft:waiting_update`

### Deck Submission Sequence
1. Player clicks submit deck
2. Client validates deck locally
3. Client sends `draft:deck_submit` event
4. Server validates submission
5. Server updates WaitingOverlayState
6. Server broadcasts `draft:submission_update`
7. When all submitted: Server broadcasts `draft:all_submitted`

### Reconnection Sequence
1. Player reconnects with session ID
2. Server validates session membership
3. Server sends full state snapshot
4. Client reconciles local state
5. Server broadcasts `draft:player_reconnected`

## Performance Considerations

### State Size Limits
- Maximum 16 players per session
- Maximum 45 cards per player draft pool
- Maximum 15 cards per pack
- State updates batched at 100ms intervals

### Caching Strategy
- Card data cached in IndexedDB
- Session state in sessionStorage
- Pack states in memory only
- Submission data persisted to database

### Network Optimization
- Delta updates for state changes
- Compression for payloads > 1KB
- Binary encoding for card IDs
- CDN for card images

## Security Measures

### Anti-Cheat
- Server validates all picks
- Timestamps prevent replay attacks
- Rate limiting on all events
- Session tokens expire after 4 hours

### Data Integrity
- Checksums on pack contents
- Audit log of all actions
- Immutable pick history
- Encrypted player IDs

## TypeScript Implementation

All entities will be implemented as strongly-typed TypeScript interfaces in:
- `/src/lib/draft/sync/types.ts` - Core draft types
- `/src/lib/draft/persistence/types.ts` - Persistence types
- `/src/lib/draft/waiting/types.ts` - Waiting overlay types

Type guards and validation functions will ensure runtime type safety:
```typescript
function isDraftSession(obj: unknown): obj is DraftSession {
  return typeof obj === 'object' && 
         obj !== null &&
         'sessionId' in obj &&
         'status' in obj;
}
```

## Testing Requirements

Each entity requires:
- Unit tests for validation logic
- Integration tests for state transitions
- Contract tests for Socket.io events
- Performance tests for large sessions

Test fixtures will use strongly-typed factories:
```typescript
function createMockDraftSession(overrides?: Partial<DraftSession>): DraftSession {
  return {
    sessionId: 'test-session-1',
    status: 'drafting',
    // ... defaults
    ...overrides
  };
}
```