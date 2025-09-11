# Data Model: Tournament MVP

**Date**: 2025-01-09  
**Based on**: Existing Prisma schema + Tournament requirements from spec.md

## Core Entities

### Tournament
**Purpose**: Represents a competitive tournament event with format, settings, and lifecycle management  
**Fields**:
- `id: string` - Unique tournament identifier (UUID)
- `name: string` - Tournament display name
- `format: TournamentFormat` - sealed | draft | constructed
- `status: TournamentStatus` - registering | preparing | active | completed | cancelled
- `maxPlayers: number` - Maximum participants (2-32)
- `creatorId: string` - Tournament organizer (User.id)
- `settings: TournamentSettings` - Format-specific configuration
- `createdAt: DateTime` - Creation timestamp
- `startedAt: DateTime?` - When preparation phase began
- `completedAt: DateTime?` - When tournament finished
- `featureFlags: Json` - Tournament-specific feature toggles

**Relationships**:
- `creator: User` - Tournament organizer
- `registrations: TournamentRegistration[]` - Participant enrollments
- `rounds: TournamentRound[]` - Tournament rounds
- `statistics: TournamentStatistics[]` - Aggregated tournament stats

**Validation Rules**:
- `maxPlayers` must be between 2 and 32
- `startedAt` must be after `createdAt`
- `completedAt` must be after `startedAt` when present
- Only creator can modify tournament settings while status is `registering`

### TournamentRegistration
**Purpose**: Tracks player enrollment and preparation status within a tournament  
**Fields**:
- `id: string` - Registration identifier
- `tournamentId: string` - Associated tournament
- `playerId: string` - Enrolled player
- `registeredAt: DateTime` - Enrollment timestamp
- `preparationStatus: PreparationStatus` - notStarted | inProgress | completed
- `deckSubmitted: boolean` - Whether deck selection completed
- `preparationData: Json` - Format-specific preparation data

**Relationships**:
- `tournament: Tournament` - Associated tournament
- `player: User` - Enrolled player
- `matches: TournamentMatch[]` - Player's tournament matches

**Validation Rules**:
- Unique constraint: `(tournamentId, playerId)`
- `preparationStatus` must be `completed` before tournament becomes `active`
- `deckSubmitted` required for `constructed` and `sealed` formats

### TournamentRound
**Purpose**: Represents a round of matches within a tournament  
**Fields**:
- `id: string` - Round identifier
- `tournamentId: string` - Associated tournament
- `roundNumber: number` - Sequential round number (1-based)
- `status: RoundStatus` - pending | active | completed
- `startedAt: DateTime?` - When round became active
- `completedAt: DateTime?` - When all matches finished
- `pairingData: Json` - Swiss pairing information

**Relationships**:
- `tournament: Tournament` - Associated tournament
- `matches: TournamentMatch[]` - Matches in this round

**Validation Rules**:
- Unique constraint: `(tournamentId, roundNumber)`
- `roundNumber` must be sequential within tournament
- Previous round must be `completed` before next round can be `active`

### TournamentMatch
**Purpose**: Individual match between two players within a tournament context  
**Fields**:
- `id: string` - Match identifier
- `tournamentId: string` - Associated tournament
- `roundId: string` - Associated round
- `player1Id: string` - First player
- `player2Id: string` - Second player
- `status: MatchStatus` - pending | active | completed | cancelled
- `result: MatchResult?` - Match outcome when completed
- `gameData: Json` - Game-specific data and settings

**Relationships**:
- `tournament: Tournament` - Associated tournament
- `round: TournamentRound` - Associated round
- `player1: User` - First player
- `player2: User` - Second player

**Validation Rules**:
- `player1Id` and `player2Id` must be different
- Both players must be registered for the tournament
- `result` required when `status` is `completed`

### TournamentStatistics
**Purpose**: Aggregated tournament performance data and standings  
**Fields**:
- `id: string` - Statistics identifier
- `tournamentId: string` - Associated tournament
- `playerId: string` - Associated player
- `wins: number` - Total wins
- `losses: number` - Total losses
- `draws: number` - Total draws
- `matchPoints: number` - Tournament scoring points
- `tiebreakers: Json` - Tiebreaker calculations
- `finalRanking: number?` - Final tournament position

**Relationships**:
- `tournament: Tournament` - Associated tournament
- `player: User` - Associated player

**Validation Rules**:
- Unique constraint: `(tournamentId, playerId)`
- `wins + losses + draws` must equal total matches played
- `matchPoints` calculated from match results
- `finalRanking` only set when tournament is `completed`

## Enums

### TournamentFormat
```typescript
enum TournamentFormat {
  SEALED = "sealed",
  DRAFT = "draft", 
  CONSTRUCTED = "constructed"
}
```

### TournamentStatus
```typescript
enum TournamentStatus {
  REGISTERING = "registering",
  PREPARING = "preparing", 
  ACTIVE = "active",
  COMPLETED = "completed",
  CANCELLED = "cancelled"
}
```

### PreparationStatus
```typescript
enum PreparationStatus {
  NOT_STARTED = "notStarted",
  IN_PROGRESS = "inProgress",
  COMPLETED = "completed"
}
```

### RoundStatus
```typescript
enum RoundStatus {
  PENDING = "pending",
  ACTIVE = "active", 
  COMPLETED = "completed"
}
```

### MatchStatus
```typescript
enum MatchStatus {
  PENDING = "pending",
  ACTIVE = "active",
  COMPLETED = "completed", 
  CANCELLED = "cancelled"
}
```

## State Transitions

### Tournament Lifecycle
```
REGISTERING → PREPARING → ACTIVE → COMPLETED
     ↓            ↓         ↓
  CANCELLED   CANCELLED  CANCELLED
```

### Round Progression
```
PENDING → ACTIVE → COMPLETED
```

### Match Flow
```
PENDING → ACTIVE → COMPLETED
    ↓       ↓         
CANCELLED CANCELLED
```

## Configuration Schema

### TournamentSettings (JSON)
```typescript
type TournamentSettings = {
  // Common settings
  roundTimeLimit?: number; // minutes per round
  matchTimeLimit?: number; // minutes per match
  
  // Format-specific settings
  sealed?: {
    packConfiguration: PackConfig[];
    deckBuildingTimeLimit: number; // minutes
  };
  
  draft?: {
    packConfiguration: PackConfig[];
    draftTimeLimit: number; // minutes per pick
    deckBuildingTimeLimit: number; // minutes
  };
  
  constructed?: {
    allowedFormats: string[];
    deckValidationRules: Record<string, unknown>;
  };
};
```

### PreparationData (JSON)
```typescript
type PreparationData = {
  sealed?: {
    packsOpened: boolean;
    deckBuilt: boolean;
    deckList: CardData[];
  };
  
  draft?: {
    draftCompleted: boolean;
    picksData: DraftPick[];
    deckBuilt: boolean; 
    deckList: CardData[];
  };
  
  constructed?: {
    deckSelected: boolean;
    deckId: string;
    deckValidated: boolean;
  };
};
```

## Integration Points

### Existing Schema Integration
- Extends existing `Tournament`, `TournamentRegistration`, `TournamentRound` models
- Integrates with `User` model for player relationships
- Links with `PackConfig` for sealed/draft pack configuration
- Uses `Deck` model for constructed format deck selection

### Socket.io Event Integration
- Tournament state changes broadcast to all participants
- Real-time statistics updates during matches
- Phase transition notifications
- Match pairing announcements

---

**Model Status**: Ready for contract generation and Prisma schema updates