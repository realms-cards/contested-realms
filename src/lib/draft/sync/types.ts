/**
 * Types for Draft Synchronization System
 * Supports coordinated pick-and-pass mechanics for multiplayer drafts
 */

import type { Position3D, EventPriority } from '@/types/draft-3d-events';

// Core draft session state for synchronization
export interface DraftSession {
  sessionId: string;
  players: string[];
  hostPlayerId: string;
  currentPack: number;
  currentPick: number;
  gamePhase: 'waiting' | 'drafting' | 'building' | 'complete';
  packContents: Record<string, string[]>; // playerId -> card IDs in current pack
  timeRemaining: number; // Seconds remaining for current pick
  pickTimer: number; // Pick timer duration (60s per research.md)
  gracePeriod: number; // Disconnection grace period (30s per research.md)
  createdAt: number;
  updatedAt: number;
  
  // Synchronization state
  pickStates: Record<string, PlayerPickState>;
  packRotationPending: boolean;
  syncVersion: number;
  version: number;
  currentRound: number;
  lastSyncTime: number;
}

// Individual player's pick state within a draft round
export interface PlayerPickState {
  playerId: string;
  hasPickedThisRound: boolean;
  pickTimestamp: number | null;
  isTimedOut: boolean;
  disconnectedAt: number | null;
  reconnectionAttempts: number;
  
  // Additional pick details
  currentPick: string | null;
  pickStartTime: number;
  pickEndTime: number;
}

// Extended player draft state for session coordination
export interface PlayerDraftState {
  playerId: string;
  sessionId: string;
  playerName: string;
  isConnected: boolean;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'unstable';
  
  // Draft progress
  currentCards: string[]; // Cards picked so far
  packPosition: number; // Position in pack rotation
  totalPicks: number;
  
  // Timing and status
  isReady: boolean;
  lastActivity: number;
  pickStartTime: number | null;
  averagePickTime: number;
  
  // UI synchronization state
  uiState: DraftUIState;
  
  // Player preferences
  preferences: PlayerPreferences;
}

// UI state for cross-client synchronization
export interface DraftUIState {
  cameraPosition: Position3D;
  cameraTarget: Position3D;
  selectedCardId?: string;
  hoveredCardId?: string;
  previewMode: 'hover' | 'focus' | 'modal' | 'inspect' | null;
  menuOpen: boolean;
  viewMode: '2d' | '3d';
  zoomLevel: number;
  
  // 3D-specific state
  cardStackHeight: number;
  animationSpeed: number;
  
  // Interaction state
  isDragging: boolean;
  isPickingCard: boolean;
  showPackContents: boolean;
}

// Player preferences for draft behavior
export interface PlayerPreferences {
  autoPass: boolean;
  showTimers: boolean;
  cardPreviewDelay: number; // milliseconds
  soundEnabled: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
  
  // Notifications
  enablePickWarnings: boolean;
  warningThresholds: number[]; // [45s, 50s, 55s] for escalating warnings
  
  // Accessibility
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderEnabled: boolean;
}

// Pick coordination and conflict resolution
export interface PickCoordination {
  sessionId: string;
  roundId: string; // Unique ID for this pick round
  requiredPlayers: string[];
  completedPlayers: string[];
  pendingPlayers: string[];
  
  // Timing
  roundStartTime: number;
  roundEndTime: number | null;
  timeoutWarnings: Record<string, number[]>; // playerId -> warning timestamps
  
  // Conflict handling
  conflicts: PickConflict[];
  resolutionMethod: 'timestamp' | 'priority' | 'random';
}

// Pick conflict when multiple players select same card
export interface PickConflict {
  conflictId: string;
  cardId: string;
  conflictingPicks: ConflictingPick[];
  resolutionTimestamp: number;
  resolvedPlayerId: string | null;
  rollbackRequired: boolean;
}

export interface ConflictingPick {
  playerId: string;
  clientTimestamp: number;
  serverTimestamp: number;
  networkLatency: number;
  priority: EventPriority;
}

// Pack state and rotation coordination
export interface PackState {
  packId: string;
  originalOwner: string;
  currentOwner: string;
  cardIds: string[];
  pickNumber: number;
  rotationIndex: number;
  
  // State tracking
  isOpen: boolean;
  hasBeenModified: boolean;
  lastModified: number;
  
  // Metadata
  setCode?: string;
  packType: 'booster' | 'custom' | 'chaos';
  originalSize: number;
}

// Performance and monitoring metrics
export interface SyncMetrics {
  sessionId: string;
  timestamp: number;
  
  // Latency metrics
  averagePickLatency: number; // Target: <100ms
  p95PickLatency: number;
  syncLatency: number;
  
  // Performance metrics  
  frameRate: number; // Target: 60fps
  memoryUsage: number; // Target: <50MB per session
  networkThroughput: number; // KB/s
  
  // Player metrics
  playerCount: number;
  activeConnections: number;
  averageConnectionQuality: number;
  
  // Error tracking
  conflictCount: number;
  timeoutCount: number;
  disconnectionCount: number;
  
  // Pick tracking
  totalPicks: number;
  playerStatusChanges: number;
  lastStatusChangeTime: number;
}

// Pick result interface for hook compatibility
export interface PickResult {
  success: boolean;
  conflict: boolean;
  message?: string;
  shouldRotate?: boolean;
}

// Event for coordinated pack rotation
export interface PackRotationEvent {
  sessionId: string;
  fromRound: number;
  toRound: number;
  rotationMap: Record<string, string>; // playerId -> new pack owner
  timestamp: number;
  syncLatency: number; // Should be <100ms
}

// Timer and warning system
export interface TimerState {
  sessionId: string;
  playerId: string;
  timerType: 'pick' | 'reconnection' | 'submission';
  
  startTime: number;
  duration: number; // Total allowed time
  remaining: number; // Time remaining
  
  warnings: TimerWarning[];
  hasTimedOut: boolean;
  autoActionTaken: boolean; // Auto-pick, auto-submit, etc.
}

export interface TimerWarning {
  threshold: number; // Seconds remaining when warning triggered
  timestamp: number;
  acknowledged: boolean;
  severity: 'info' | 'warning' | 'critical';
}

// State validation and consistency
export interface StateValidation {
  sessionId: string;
  validationId: string;
  timestamp: number;
  
  // Validation checks
  playerCountConsistent: boolean;
  packContentsValid: boolean;
  pickStatesConsistent: boolean;
  timingValid: boolean;
  
  // Detected issues
  issues: ValidationIssue[];
  correctionActions: string[];
  
  // Validation metadata
  validatorVersion: string;
  checksPerformed: string[];
}

export interface ValidationIssue {
  issueId: string;
  severity: 'warning' | 'error' | 'critical';
  category: 'timing' | 'state' | 'network' | 'data';
  description: string;
  affectedPlayers: string[];
  suggestedAction: string;
  autoFixAvailable: boolean;
}

// Complete sync manager state
export interface DraftSyncState {
  session: DraftSession;
  players: Record<string, PlayerDraftState>;
  packs: Record<string, PackState>;
  coordination: PickCoordination;
  timers: Record<string, TimerState>;
  metrics: SyncMetrics;
  validation: StateValidation;
  
  // Cache and optimization
  lastSyncTimestamp: number;
  pendingOperations: string[];
  batchedUpdates: string[];
}