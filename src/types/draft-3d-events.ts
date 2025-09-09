/**
 * TypeScript interfaces for Draft-3D Online Integration events
 * These events extend the existing Socket.io transport for real-time synchronization
 * of improved UI, stack mechanics, and card preview systems
 */

// Core 3D position type for card synchronization
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

// Operation data structures for different interaction types
export interface OperationData {
  userInitiated: boolean;
  hasAnimation: boolean;
  targetPosition?: Position3D;
  animationDuration?: number;
  sourceStackId?: string;
  targetStackId?: string;
  destinationPlayerId?: string;
  metadata?: Record<string, unknown>;
}

// UI Update data structures
export interface UIUpdateData {
  cardId?: string;
  position?: Position3D;
  rotation?: { x: number; y: number; z: number };
  scale?: number;
  opacity?: number;
  visible?: boolean;
  metadata?: Record<string, unknown>;
}

// Player state for draft sessions
export interface PlayerState {
  playerId: string;
  playerName: string;
  isConnected: boolean;
  currentPack?: string[];
  pickedCards?: string[];
  isReady?: boolean;
  lastActivity: number;
}

// Session state for draft sessions  
export interface SessionState {
  sessionId: string;
  phase: 'waiting' | 'drafting' | 'building' | 'complete';
  currentPack: number;
  timeRemaining?: number;
  playerCount: number;
  packSize: number;
}

// Batch update data structure
export interface BatchUpdateData {
  playerId: string;
  type: string;
  data: UIUpdateData;
  timestamp: number;
}

// Card preview event types
export interface CardPreviewEvent {
  sessionId: string;
  playerId: string;
  cardId: string;
  previewType: PreviewType;
  position: Position3D;
  isActive: boolean;
  priority: EventPriority;
  timestamp: number;
}

export interface CardPreviewUpdateEvent {
  previewId: string;
  sessionId: string;
  playerId: string;
  cardId: string;
  previewType: PreviewType;
  position: Position3D;
  isActive: boolean;
  priority: EventPriority;
  timestamp: number;
}

// Stack interaction event types
export interface StackInteractionEvent {
  sessionId: string;
  playerId: string;
  interactionType: StackInteractionType;
  cardIds: string[];
  fromStackId?: string;
  toStackId?: string;
  operationData: OperationData;
  clientTimestamp: number;
}

export interface StackInteractionResult {
  interactionId: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'conflict';
  success: boolean;
  resultData?: OperationData;
  conflictsWith?: string[];
  rollbackRequired?: boolean;
  error?: string;
  errorMessage?: string;
}

export interface StackStateSync {
  sessionId: string;
  stackUpdates: {
    stackId: string;
    cardIds: string[];
    positions: Position3D[];
    lastModified: number;
  }[];
  batchId: string;
}

// UI synchronization event types
export interface UIUpdateEvent {
  sessionId: string;
  playerId: string;
  uiUpdates: {
    type: 'card_position' | 'camera_angle' | 'menu_state';
    data: UIUpdateData;
    priority: EventPriority;
  }[];
  batchId?: string;
}

export interface UISyncBatch {
  sessionId: string;
  updates: BatchUpdateData[];
  batchId: string;
}

// Session management event types
export interface SessionJoinEvent {
  sessionId: string;
  playerId: string;
  playerName: string;
  reconnection?: boolean;
}

export interface SessionJoinedEvent {
  sessionId: string;
  playerState: PlayerState;
  sessionState: SessionState;
  otherPlayers: PlayerState[];
}

export interface SessionLeaveEvent {
  sessionId: string;
  playerId: string;
}

// Error handling
export interface Draft3DError {
  errorCode: string;
  errorMessage: string;
  error: Error | string | unknown;
  context?: Record<string, unknown>;
  severity: 'warning' | 'error' | 'critical';
}

// Reconnection event
export interface ReconnectEvent {
  sessionId: string;
  playerId: string;
  lastKnownState?: string;
}

// Event payload types for Socket.io transport integration
export interface Draft3DEventMap {
  // Card preview events
  'draft:card:preview': CardPreviewEvent;
  'draft:card:preview_update': CardPreviewUpdateEvent;
  
  // Stack interaction events
  'draft:stack:interact': StackInteractionEvent;
  'draft:stack:interaction_result': StackInteractionResult;
  'draft:stack:state_sync': StackStateSync;
  
  // UI synchronization events
  'draft:ui:update': UIUpdateEvent;
  'draft:ui:sync_batch': UISyncBatch;
  
  // Session management events
  'draft:session:join': SessionJoinEvent;
  'draft:session:joined': SessionJoinedEvent;
  'draft:session:leave': SessionLeaveEvent;
  
  // System events
  'draft:error': Draft3DError;
  'draft:system:reconnect': ReconnectEvent;
}

// Event priority levels for network optimization
export type EventPriority = 'high' | 'medium' | 'low';

// Preview types for different interaction modes
export type PreviewType = 'hover' | 'focus' | 'modal' | 'inspect' | 'select';

// Stack interaction types
export type StackInteractionType = 'pick' | 'pass' | 'rearrange' | 'inspect' | 'reorder' | 'mulligan';

// UI update types
export type UIUpdateType = 'card_position' | 'camera_angle' | 'menu_state';

// Interaction result status
export type InteractionStatus = 'completed' | 'failed' | 'conflict' | 'pending' | 'processing';

// Error severity levels
export type ErrorSeverity = 'warning' | 'error' | 'critical';