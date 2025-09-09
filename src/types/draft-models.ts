/**
 * Data models for Draft-3D Online Integration
 * Organized state structures for multiplayer draft sessions with enhanced UI and mechanics
 */

import type { Position3D, EventPriority, PreviewType, StackInteractionType, InteractionStatus } from './draft-3d-events';

// Core online draft session state
export interface OnlineDraftSession {
  sessionId: string;
  players: string[]; // Array of connected player IDs (max 8)
  currentPack: number;
  currentPick: number;
  gamePhase: 'waiting' | 'drafting' | 'building' | 'complete';
  packContents: Record<string, string[]>; // Map of player ID to pack contents
  timeRemaining: number; // Time remaining for current pick (seconds)
  hostPlayerId: string;
  createdAt: number;
  updatedAt: number;
}

// Individual player's draft state in online session
export interface PlayerDraftState {
  playerId: string;
  sessionId: string;
  playerName: string;
  isConnected: boolean;
  currentCards: string[]; // Array of card IDs in player's current picks
  packPosition: number; // Current position in pack rotation
  isReady: boolean;
  uiState: UIState; // Current UI interaction state
  lastActivity: number; // Timestamp of last player action
  preferenceSettings: PlayerPreferences;
}

// UI state for synchronization across clients
export interface UIState {
  cameraPosition: Position3D;
  cameraTarget: Position3D;
  selectedCardId?: string;
  hoveredCardId?: string;
  menuOpen: boolean;
  viewMode: '2d' | '3d';
  zoomLevel: number;
}

// Player preferences for UI behavior
export interface PlayerPreferences {
  autoPass: boolean;
  showTimers: boolean;
  cardPreviewDelay: number; // milliseconds
  soundEnabled: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
}

// Card preview state for multiplayer coordination
export interface CardPreviewState {
  previewId: string;
  sessionId: string;
  playerId: string;
  cardId: string;
  previewType: PreviewType;
  position: Position3D;
  isActive: boolean;
  priority: EventPriority;
  startTime: number;
  expiresAt: number;
}

// Stack interaction for conflict resolution
export interface StackInteraction {
  interactionId: string;
  sessionId: string;
  initiatingPlayerId: string;
  cardIds: string[];
  interactionType: StackInteractionType;
  fromStackId?: string;
  toStackId?: string;
  operationTimestamp: number; // Server timestamp
  operationData: StackOperationData;
  status: InteractionStatus;
  conflictsWith: string[]; // Array of conflicting interaction IDs
  resolutionMethod: 'timestamp' | 'priority' | 'rollback';
}

// Stack operation data for different interaction types
export interface StackOperationData {
  // For 'pick' operations
  targetPosition?: Position3D;
  
  // For 'rearrange' operations
  newOrder?: string[]; // New card order
  
  // For 'pass' operations
  destinationPlayerId?: string;
  
  // For 'inspect' operations
  duration?: number; // How long to inspect
  
  // Common metadata
  userInitiated: boolean;
  hasAnimation: boolean;
  metadata?: Record<string, unknown>;
}

// Draft session configuration
export interface DraftSessionConfig {
  maxPlayers: number;
  packSize: number;
  numberOfPacks: number;
  pickTimer: number; // seconds per pick
  allowSpectators: boolean;
  enableChat: boolean;
  draftFormat: 'regular' | 'chaos' | 'cube';
}

// Player connection state
export interface PlayerConnection {
  playerId: string;
  socketId: string;
  isConnected: boolean;
  lastPingTime: number;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unstable';
  reconnectionAttempts: number;
}

// Draft pack state
export interface DraftPack {
  packId: string;
  cardIds: string[];
  currentOwner: string; // player ID
  pickNumber: number;
  isOpen: boolean;
  metadata: {
    setCode?: string;
    packType?: string;
    originalOwner?: string;
  };
}

// Card state in draft context
export interface DraftCard {
  cardId: string;
  currentOwner?: string; // player ID if picked
  packId?: string; // which pack it's currently in
  position: Position3D;
  isHovered: boolean;
  isPicked: boolean;
  isVisible: boolean; // for face-down cards
  metadata: {
    rarity?: string;
    manaCost?: string;
    cardType?: string;
  };
}

// Synchronization state for real-time updates
export interface SyncState {
  lastSyncTimestamp: number;
  pendingOperations: string[]; // interaction IDs
  conflictResolutionQueue: string[];
  batchId?: string;
  syncVersion: number;
}

// Error state for draft sessions
export interface DraftError {
  errorId: string;
  timestamp: number;
  playerId?: string;
  errorType: 'network' | 'validation' | 'conflict' | 'system';
  message: string;
  context: Record<string, unknown>;
  resolved: boolean;
}

// Performance metrics for monitoring
export interface PerformanceMetrics {
  sessionId: string;
  timestamp: number;
  playerCount: number;
  cardCount: number;
  averageLatency: number; // ms
  frameRate: number;
  memoryUsage: number; // MB
  networkThroughput: number; // KB/s
}

// Complete online draft state (root state object)
export interface OnlineDraftState {
  session: OnlineDraftSession;
  players: Record<string, PlayerDraftState>; // playerId -> state
  cards: Record<string, DraftCard>; // cardId -> state
  packs: Record<string, DraftPack>; // packId -> state
  previews: Record<string, CardPreviewState>; // previewId -> state
  interactions: Record<string, StackInteraction>; // interactionId -> state
  connections: Record<string, PlayerConnection>; // playerId -> connection
  sync: SyncState;
  errors: DraftError[];
  metrics?: PerformanceMetrics;
}