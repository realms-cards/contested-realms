/**
 * Types for Draft Deck Persistence System
 * Core requirement: "Deck editor preserves drafted cards when adding Standard Cards"
 */

// Core deck submission interface
export interface DeckSubmission {
  submissionId: string;
  sessionId: string;
  playerId: string;
  playerName: string;
  
  // Deck composition - CRITICAL: drafted cards must never be lost
  deck: DeckComposition;
  
  // Submission metadata
  submittedAt: number;
  lastModified: number;
  deckHash: string; // For integrity verification
  
  // Status tracking
  status: SubmissionStatus;
  validationResult: DeckValidationResult;
  
  // Browser session persistence
  sessionStorageKey: string;
  routePersisted: boolean;
}

// Core deck structure that must be preserved
export interface DeckComposition {
  // NEVER CLEAR THESE - core requirement
  draftedCards: string[]; // Cards picked during draft
  
  // Can be added/modified safely
  standardCards: string[]; // Cards added from Standard pool
  sideboard: string[]; // Alias for backwards compatibility
  sideboardCards: string[]; // New preferred name
  
  // Deck metadata
  deckName: string;
  totalCards: number;
  colors: string[];
  manaCurve: Record<number, number>;
  
  // Composition history for undo/recovery
  compositionHistory: DeckCompositionEntry[];
  
  // Validation flags
  isDraftComplete: boolean;
  meetsMinimumSize: boolean;
  hasIllegalCards: boolean;
  
  // Timestamps
  lastModified: number;
  
  // Hook state properties
  isDirty: boolean;
  currentDeck?: DeckComposition;
  isRestoring: boolean;
  isValidating: boolean;
  hasErrors: boolean;
  metrics?: PersistenceMetrics;
  undoRedo?: {
    canUndo: boolean;
    canRedo: boolean;
    historyLength: number;
  };
}

// Individual deck composition entry for history tracking
export interface DeckCompositionEntry {
  entryId: string;
  timestamp: number;
  action: DeckAction;
  cardId?: string;
  cardIds?: string[];
  sourceSection: DeckSection;
  targetSection?: DeckSection;
  reversible: boolean;
}

export type DeckAction = 
  | 'draft_pick' 
  | 'add_standard' 
  | 'remove_card' 
  | 'move_to_sideboard' 
  | 'move_to_mainboard'
  | 'bulk_add_standard'
  | 'route_transition'
  | 'browser_refresh';

export type DeckSection = 'drafted' | 'standard' | 'sideboard' | 'removed';

export type SubmissionStatus = 
  | 'building'
  | 'validating' 
  | 'submitted'
  | 'failed'
  | 'timeout';

// Deck validation results
export interface DeckValidationResult {
  isValid: boolean;
  errors: DeckValidationError[];
  warnings: DeckValidationWarning[];
  
  // Specific validation checks
  draftedCardsIntact: boolean;
  minimumSizeMet: boolean;
  legalityChecked: boolean;
  hashVerified: boolean;
  
  validatedAt: number;
  validatorVersion: string;
}

export interface DeckValidationError {
  errorId: string;
  severity: 'error' | 'critical';
  category: 'composition' | 'legality' | 'integrity' | 'size';
  message: string;
  affectedCards: string[];
  suggestedFix?: string;
  autoFixAvailable: boolean;
}

export interface DeckValidationWarning {
  warningId: string;
  category: 'optimization' | 'strategy' | 'mana' | 'curve';
  message: string;
  recommendation?: string;
}

// Browser persistence and route management
export interface PersistenceState {
  sessionId: string;
  playerId: string;
  
  // Storage locations
  sessionStorageData: SessionStorageData;
  localStorageBackup: LocalStorageBackup;
  
  // Route tracking
  currentRoute: string;
  lastRoute: string;
  routeTransitionTime: number;
  
  // State recovery
  lastSuccessfulPersist: number;
  recoveryAttempts: number;
  maxRecoveryAttempts: number;
  
  // Browser session handling
  browserSessionId: string;
  pageRefreshCount: number;
  unloadListenerActive: boolean;
}

export interface SessionStorageData {
  key: string; // sessionStorage key
  data: DeckComposition;
  lastSaved: number;
  dataSize: number; // bytes
  compressionUsed: boolean;
  
  // Integrity checking
  checksum: string;
  version: string;
}

export interface LocalStorageBackup {
  key: string; // localStorage key for fallback
  data: Partial<DeckComposition>; // Essential data only
  createdAt: number;
  maxAge: number; // milliseconds
  
  // Backup metadata
  reason: 'quota_exceeded' | 'session_timeout' | 'browser_close';
  originalSize: number;
  compressedSize: number;
}

// Deck modification tracking and conflict resolution
export interface DeckModification {
  modificationId: string;
  sessionId: string;
  playerId: string;
  
  // Modification details
  timestamp: number;
  action: DeckAction;
  before: Partial<DeckComposition>;
  after: Partial<DeckComposition>;
  
  // Context
  triggerSource: ModificationSource;
  userInitiated: boolean;
  
  // State
  applied: boolean;
  rolledBack: boolean;
  conflictsWith?: string[]; // Other modification IDs
}

export type ModificationSource = 
  | 'user_action'
  | 'draft_pick'
  | 'add_standard_cards'
  | 'route_change'
  | 'auto_save'
  | 'recovery'
  | 'sync';

// Multi-player submission coordination
export interface SubmissionCoordination {
  sessionId: string;
  totalPlayers: number;
  
  // Submission tracking
  submissions: Record<string, DeckSubmission>;
  submissionOrder: string[]; // playerId order
  
  // Progress tracking
  playersSubmitted: string[];
  playersBuilding: string[];
  playersTimedOut: string[];
  
  // Timing
  submissionStartTime: number;
  submissionDeadline: number;
  gracePeriodEnd: number;
  
  // Coordination state
  allPlayersReady: boolean;
  canProceedToNextPhase: boolean;
  waitingOverlayActive: boolean;
}

// Performance monitoring for persistence operations
export interface PersistenceMetrics {
  sessionId: string;
  playerId: string;
  timestamp: number;
  
  // Operation metrics
  persistenceTime: number; // ms to save deck
  restorationTime: number; // ms to restore deck
  validationTime: number; // ms to validate deck
  
  // Data metrics
  deckSize: number; // number of cards
  dataSize: number; // bytes in storage
  compressionRatio: number;
  
  // Error tracking
  persistenceErrors: number;
  validationErrors: number;
  recoveryAttempts: number;
  
  // Browser metrics
  storageQuotaUsed: number; // percentage
  storageQuotaTotal: number; // bytes
  sessionStorageAvailable: boolean;
  localStorageAvailable: boolean;
}

// Storage quota and management
export interface StorageQuotaInfo {
  sessionStorage: StorageInfo;
  localStorage: StorageInfo;
  
  // Quota management
  totalQuota: number;
  usedQuota: number;
  availableQuota: number;
  quotaExceeded: boolean;
  
  // Cleanup strategies
  cleanupStrategies: CleanupStrategy[];
  lastCleanup: number;
}

export interface StorageInfo {
  available: boolean;
  quota: number; // bytes
  used: number; // bytes
  remaining: number; // bytes
  itemCount: number;
  
  // Performance
  averageWriteTime: number;
  averageReadTime: number;
}

export interface CleanupStrategy {
  strategy: 'compress_data' | 'remove_old_sessions' | 'use_indexeddb' | 'warn_user';
  priority: number;
  estimatedSpaceSaved: number; // bytes
  implementationCost: 'low' | 'medium' | 'high';
  userImpact: 'none' | 'minimal' | 'noticeable';
}

// Undo/Redo system for deck modifications
export interface UndoRedoState {
  sessionId: string;
  playerId: string;
  
  // History stacks
  undoStack: DeckModification[];
  redoStack: DeckModification[];
  
  // Constraints
  maxHistorySize: number;
  currentHistorySize: number;
  
  // State
  canUndo: boolean;
  canRedo: boolean;
  
  // Operations
  lastUndoTimestamp: number;
  lastRedoTimestamp: number;
  
  // Special handling for critical operations
  draftPicksUndoable: boolean; // Usually false
  standardCardsUndoable: boolean; // Usually true
}

// Complete persistence manager state
export interface DeckPersistenceState {
  // Current deck state
  currentDeck: DeckComposition | null;
  submission: DeckSubmission | null;
  
  // Browser persistence
  persistence: PersistenceState;
  
  // Coordination with other players
  coordination: SubmissionCoordination | null;
  
  // Modification tracking
  modifications: DeckModification[];
  undoRedo: UndoRedoState;
  
  // Performance and monitoring
  metrics: PersistenceMetrics;
  storageQuota: StorageQuotaInfo;
  
  // State flags
  isDirty: boolean; // Has unsaved changes
  isRestoring: boolean; // Currently restoring from storage
  isValidating: boolean; // Currently validating deck
  hasErrors: boolean; // Has validation errors
}