# Socket.io Event Contracts: Draft-3D Online Integration

**Date**: 2025-01-09  
**Phase**: 1 - Design & Contracts  
**Event Protocol Version**: 1.0  

## Core Event Categories

### 1. Session Management Events

#### `draft:session:join`
**Direction**: Client → Server  
**Purpose**: Player requests to join a draft session  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  playerName: string;
  reconnection?: boolean;
}
```
**Response**: `draft:session:joined` or `draft:session:join_failed`

#### `draft:session:joined`
**Direction**: Server → Client  
**Purpose**: Confirm successful session join  
**Payload**:
```typescript
{
  sessionId: string;
  playerState: PlayerDraftState;
  sessionState: OnlineDraftSession;
  otherPlayers: PlayerDraftState[];
}
```

#### `draft:session:leave`
**Direction**: Client → Server  
**Purpose**: Player voluntarily leaves session  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
}
```

### 2. Card Preview Events

#### `draft:card:preview`
**Direction**: Client → Server  
**Purpose**: Broadcast card preview state to other players  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  cardId: string;
  previewType: 'hover' | 'focus' | 'modal';
  position: { x: number; y: number; z: number };
  isActive: boolean;
  priority: 'high' | 'low';
}
```
**Broadcast**: `draft:card:preview_update` to all session members except sender

#### `draft:card:preview_update`
**Direction**: Server → Client  
**Purpose**: Update preview state for all players  
**Payload**:
```typescript
{
  previewId: string;
  playerId: string;
  cardId: string;
  previewType: 'hover' | 'focus' | 'modal';
  position: { x: number; y: number; z: number };
  isActive: boolean;
  timestamp: number;
}
```

### 3. Stack Interaction Events

#### `draft:stack:interact`
**Direction**: Client → Server  
**Purpose**: Initiate stack interaction (pick, pass, rearrange)  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  interactionType: 'pick' | 'pass' | 'rearrange' | 'inspect';
  cardIds: string[];
  fromStackId?: string;
  toStackId?: string;
  operationData: Record<string, any>;
  clientTimestamp: number;
}
```
**Response**: `draft:stack:interaction_result`

#### `draft:stack:interaction_result`
**Direction**: Server → Client  
**Purpose**: Result of stack interaction processing  
**Payload**:
```typescript
{
  interactionId: string;
  status: 'completed' | 'failed' | 'conflict';
  resultData?: Record<string, any>;
  conflictsWith?: string[];
  rollbackRequired?: boolean;
  errorMessage?: string;
}
```

#### `draft:stack:state_sync`
**Direction**: Server → Client  
**Purpose**: Synchronize stack state across all players  
**Payload**:
```typescript
{
  sessionId: string;
  stackUpdates: {
    stackId: string;
    cardIds: string[];
    positions: { x: number; y: number; z: number }[];
    lastModified: number;
  }[];
  batchId: string;
}
```

### 4. UI State Synchronization Events

#### `draft:ui:update`
**Direction**: Client → Server  
**Purpose**: Synchronize UI state changes  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  uiUpdates: {
    type: 'card_position' | 'camera_angle' | 'menu_state';
    data: Record<string, any>;
    priority: 'high' | 'low';
  }[];
  batchId?: string;
}
```

#### `draft:ui:sync_batch`
**Direction**: Server → Client  
**Purpose**: Batched UI synchronization for performance  
**Payload**:
```typescript
{
  sessionId: string;
  updates: {
    playerId: string;
    type: 'card_position' | 'camera_angle' | 'menu_state';
    data: Record<string, any>;
    timestamp: number;
  }[];
  batchId: string;
}
```

### 5. Draft Action Events

#### `draft:player:action`
**Direction**: Client → Server  
**Purpose**: Core draft actions (pick card, pass pack)  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  action: 'pick_card' | 'pass_pack' | 'submit_deck';
  cardId?: string;
  packId?: string;
  deckData?: Record<string, any>;
  clientTimestamp: number;
}
```

#### `draft:action:validated`
**Direction**: Server → Client  
**Purpose**: Confirmation of valid draft action  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  action: string;
  actionId: string;
  newGameState: Partial<OnlineDraftSession>;
  affectedPlayers: string[];
}
```

### 6. Error and System Events

#### `draft:error`
**Direction**: Server → Client  
**Purpose**: Error notification  
**Payload**:
```typescript
{
  errorCode: string;
  errorMessage: string;
  context?: Record<string, any>;
  severity: 'warning' | 'error' | 'critical';
}
```

#### `draft:system:reconnect`
**Direction**: Client → Server  
**Purpose**: Request state synchronization after reconnection  
**Payload**:
```typescript
{
  sessionId: string;
  playerId: string;
  lastKnownState?: string;
}
```

## Event Processing Rules

### Priority System
- **High Priority**: Draft actions, error messages, session management
- **Low Priority**: Card previews, UI updates, hover states
- **Processing Order**: High priority events processed immediately, low priority throttled

### Batching Strategy
- UI updates batched every 16ms (60fps)
- Card preview updates debounced to 100ms
- Stack interactions processed individually for accuracy
- Error events bypass all batching

### Conflict Resolution
- Server timestamp always takes precedence
- Concurrent operations on same resource use operational transform
- Client rollback required for failed operations
- State snapshots available for recovery

### Network Optimization
- Binary encoding for position/rotation data
- Delta compression for frequent updates
- WebSocket compression enabled
- Maximum message size: 64KB

---
*Socket.io Event Contracts Complete - Ready for implementation*