# Data Model: Draft-3D Online Integration

**Date**: 2025-01-09  
**Phase**: 1 - Design & Contracts  
**Status**: Complete  

## Core Entities

### OnlineDraftSession
Represents a multiplayer draft game with enhanced UI and mechanics, maintaining player states and synchronization.

**Fields**:
- `sessionId`: Unique identifier for the draft session
- `players`: Array of connected player IDs (max 8)
- `currentPack`: Current pack being drafted
- `currentPick`: Current pick number within the pack
- `gamePhase`: Enum ('waiting', 'drafting', 'building', 'complete')
- `packContents`: Map of pack contents for each player
- `timeRemaining`: Time remaining for current pick (seconds)
- `hostPlayerId`: Player ID of session host
- `createdAt`: Session creation timestamp
- `updatedAt`: Last activity timestamp

**Relationships**:
- Has many PlayerDraftState (one per connected player)
- Has many CardPreviewState (active preview states)
- Has many StackInteraction (pending stack operations)

**State Transitions**:
- `waiting` → `drafting` (when all players ready)
- `drafting` → `building` (when all packs complete)
- `building` → `complete` (when all players submit decks)
- Any state → `waiting` (on error/reset)

### PlayerDraftState
Individual player's view and interaction state within the enhanced draft interface, including preview states and stack interactions.

**Fields**:
- `playerId`: Unique player identifier
- `sessionId`: Reference to draft session
- `playerName`: Display name for the player
- `isConnected`: Connection status (boolean)
- `currentCards`: Array of card IDs in player's current picks
- `packPosition`: Current position in pack rotation
- `isReady`: Ready status for next phase
- `uiState`: Current UI interaction state (JSON)
- `lastActivity`: Timestamp of last player action
- `preferenceSettings`: Player UI preferences (JSON)

**Relationships**:
- Belongs to OnlineDraftSession
- Has many CardPreviewState (cards being previewed by this player)
- Has many StackInteraction (stack operations initiated by this player)

**Validation Rules**:
- `playerId` must be unique within session
- `currentCards` cannot exceed draft limits (typically 45 cards)
- `lastActivity` updated on any player action
- `isReady` can only be true when player has valid deck

### CardPreviewState
Current card being previewed by each player, requiring coordination in multiplayer context to show hover states across all clients.

**Fields**:
- `previewId`: Unique identifier for this preview instance
- `sessionId`: Reference to draft session
- `playerId`: Player initiating the preview
- `cardId`: Card being previewed
- `previewType`: Type of preview ('hover', 'focus', 'modal')
- `position`: 3D position coordinates (x, y, z)
- `isActive`: Whether preview is currently active
- `priority`: Priority level ('high', 'low') for network optimization
- `startTime`: When preview was initiated
- `expiresAt`: When preview should auto-expire

**Relationships**:
- Belongs to OnlineDraftSession
- Belongs to PlayerDraftState

**Validation Rules**:
- Only one 'focus' or 'modal' preview per player
- Multiple 'hover' previews allowed but limited to 3 per player
- `expiresAt` must be within 30 seconds of `startTime`
- `priority` determines network broadcast order

### StackInteraction
Collection of cards with improved interaction mechanics that must sync across all players, handling conflict resolution for simultaneous operations.

**Fields**:
- `interactionId`: Unique identifier for the interaction
- `sessionId`: Reference to draft session
- `initiatingPlayerId`: Player who started the interaction
- `cardIds`: Array of cards involved in the interaction
- `interactionType`: Type of interaction ('pick', 'pass', 'rearrange', 'inspect')
- `fromStackId`: Source stack identifier (if applicable)
- `toStackId`: Target stack identifier (if applicable)
- `operationTimestamp`: Server timestamp when operation occurred
- `operationData`: JSON containing operation-specific data
- `status`: Current status ('pending', 'processing', 'completed', 'failed')
- `conflictsWith`: Array of other interaction IDs that conflict
- `resolutionMethod`: How conflicts were resolved ('timestamp', 'priority', 'rollback')

**Relationships**:
- Belongs to OnlineDraftSession
- Belongs to PlayerDraftState (initiating player)

**State Transitions**:
- `pending` → `processing` (when server validates operation)
- `processing` → `completed` (when operation successfully applied)
- `processing` → `failed` (when operation conflicts or is invalid)
- Any state → `failed` (on error or conflict)

**Validation Rules**:
- `operationTimestamp` must be server-generated (prevents cheating)
- `cardIds` must exist and be available to the initiating player
- Conflicting operations resolved by timestamp ordering
- Failed operations trigger client-side rollback

## Data Flow Patterns

### Real-time Synchronization Flow
1. Player initiates action (UI interaction)
2. Client optimistically updates local state
3. Client sends operation to server via Socket.io
4. Server validates operation and checks for conflicts
5. Server applies operation transform if conflicts exist
6. Server broadcasts validated operation to all clients
7. Clients apply operation or rollback if rejected

### State Consistency Rules
- Server is single source of truth for all critical game state
- Client-side state used only for UI responsiveness (optimistic updates)
- All state mutations logged with timestamps for conflict resolution
- State snapshots taken every 30 seconds for recovery purposes

### Performance Optimizations
- Card preview states use debounced broadcasting (100ms)
- Stack interactions use operational transform for conflict resolution
- Player states batch-updated every 16ms for smooth 60fps rendering
- Session state uses Redis pub/sub for horizontal scaling

---
*Phase 1 Data Model Complete - Entities defined with relationships and validation rules*