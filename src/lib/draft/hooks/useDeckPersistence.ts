/**
 * React Hooks for Deck Persistence Integration
 * Provides React components with deck persistence and submission functionality
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useSocket } from '@/lib/hooks/useSocket';
import { DeckPersistenceManager } from '../persistence/DeckPersistenceManager';
import { SubmissionSocketHandler } from '../persistence/socketHandlers';
import type {
  DeckComposition,
  DeckValidationResult,
  PersistenceMetrics,
  DeckModification,
} from '../persistence/types';
import { WaitingStateManager } from '../waiting/WaitingStateManager';
import type {
  WaitingOverlayState,
  PlayerStatus
} from '../waiting/types';

// Hook return types
interface UseDeckPersistenceReturn {
  // Deck state
  currentDeck: DeckComposition | null;
  isDirty: boolean;
  isRestoring: boolean;
  isValidating: boolean;
  hasErrors: boolean;
  
  // Core deck operations
  addStandardCards: (cardIds: string[]) => Promise<boolean>;
  removeCard: (cardId: string) => Promise<boolean>;
  moveToSideboard: (cardId: string) => Promise<boolean>;
  moveToMainboard: (cardId: string) => Promise<boolean>;
  
  // Persistence operations
  saveDeck: () => Promise<boolean>;
  restoreDeck: () => Promise<DeckComposition | null>;
  submitDeck: () => Promise<{ success: boolean; submissionId?: string; error?: string }>;
  
  // Validation
  validateDeck: () => Promise<DeckValidationResult>;
  
  // Metrics
  metrics: PersistenceMetrics | null;
  
  // Error handling
  lastError: string | null;
}

interface UseSubmissionCoordinationReturn {
  // Submission state
  isSubmissionActive: boolean;
  playersSubmitted: string[];
  playersBuilding: string[];
  allPlayersReady: boolean;
  
  // Submission actions
  startSubmissionWaiting: (players: string[]) => void;
  updateSubmissionStatus: (status: PlayerStatus, progress?: Record<string, unknown>) => void;
  
  // Waiting overlay
  waitingState: WaitingOverlayState | null;
  
  // Coordination data
  submissionDeadline: number | null;
  timeRemaining: number | null;
}

interface UseDeckUndoRedoReturn {
  // Undo/Redo state
  canUndo: boolean;
  canRedo: boolean;
  historySize: number;
  
  // Actions
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  clearHistory: () => void;
  
  // History inspection
  undoStack: DeckModification[];
  redoStack: DeckModification[];
}

interface UseDeckValidationReturn {
  // Validation state
  isValid: boolean;
  isValidating: boolean;
  validationResult: DeckValidationResult | null;
  
  // Validation actions
  validateDeck: () => Promise<DeckValidationResult>;
  autoFixErrors: () => Promise<boolean>;
  
  // Error analysis
  criticalErrors: string[];
  warnings: string[];
  hasIntegrityIssues: boolean;
}

/**
 * Primary hook for deck persistence functionality
 */
export function useDeckPersistence(sessionId: string, playerId: string): UseDeckPersistenceReturn {
  const socket = useSocket();
  const persistenceManagerRef = useRef<DeckPersistenceManager | null>(null);
  const socketHandlerRef = useRef<SubmissionSocketHandler | null>(null);
  const waitingManagerRef = useRef<WaitingStateManager | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Initialize managers
  useEffect(() => {
    if (!socket) return;

    // Create persistence manager
    if (!persistenceManagerRef.current) {
      persistenceManagerRef.current = new DeckPersistenceManager();
      console.log('[useDeckPersistence] Created DeckPersistenceManager');
    }

    // Create waiting manager
    if (!waitingManagerRef.current) {
      waitingManagerRef.current = new WaitingStateManager();
      console.log('[useDeckPersistence] Created WaitingStateManager');
    }

    // Create socket handler
    if (!socketHandlerRef.current) {
      socketHandlerRef.current = new SubmissionSocketHandler(
        socket,
        persistenceManagerRef.current,
        waitingManagerRef.current
      );
      console.log('[useDeckPersistence] Created SubmissionSocketHandler');
    }

    // Initialize session
    persistenceManagerRef.current.initializeSession(sessionId);
    socketHandlerRef.current.connectToSubmissionSession(sessionId, playerId);

    return () => {
      // Cleanup on socket change
      if (socketHandlerRef.current) {
        socketHandlerRef.current.destroy();
        socketHandlerRef.current = null;
      }
    };
  }, [socket, sessionId, playerId]);

  // Core deck operations
  const addStandardCards = useCallback(async (cardIds: string[]): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log(`[useDeckPersistence] Adding ${cardIds.length} standard cards`);
      
      const result = await persistenceManagerRef.current.addStandardCards(cardIds);
      const success = typeof result === 'boolean' ? result : result.success;
      
      if (success) {
        // Broadcast deck save
        socketHandlerRef.current?.broadcastDeckSave();
      } else {
        setLastError('Failed to add standard cards - drafted cards may have been affected');
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      console.error('[useDeckPersistence] Error adding standard cards:', error);
      return false;
    }
  }, []);

  const removeCard = useCallback(async (cardId: string): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log(`[useDeckPersistence] Removing card ${cardId}`);
      
      const success = await persistenceManagerRef.current.removeCard(cardId);
      
      if (success) {
        socketHandlerRef.current?.broadcastDeckSave();
      } else {
        setLastError('Failed to remove card');
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      console.error('[useDeckPersistence] Error removing card:', error);
      return false;
    }
  }, []);

  const moveToSideboard = useCallback(async (cardId: string): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log(`[useDeckPersistence] Moving card ${cardId} to sideboard`);
      
      const success = await persistenceManagerRef.current.moveToSideboard(cardId);
      
      if (success) {
        socketHandlerRef.current?.broadcastDeckSave();
      } else {
        setLastError('Failed to move card to sideboard');
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      return false;
    }
  }, []);

  const moveToMainboard = useCallback(async (cardId: string): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log(`[useDeckPersistence] Moving card ${cardId} to mainboard`);
      
      const success = await persistenceManagerRef.current.moveToMainboard(cardId);
      
      if (success) {
        socketHandlerRef.current?.broadcastDeckSave();
      } else {
        setLastError('Failed to move card to mainboard');
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      return false;
    }
  }, []);

  // Persistence operations
  const saveDeck = useCallback(async (): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log('[useDeckPersistence] Saving deck');
      
      const success = await persistenceManagerRef.current.saveDeck();
      
      if (success) {
        socketHandlerRef.current?.broadcastDeckSave();
        setLastError(null);
      } else {
        setLastError('Failed to save deck');
      }
      
      return success;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      return false;
    }
  }, []);

  const restoreDeck = useCallback(async (): Promise<DeckComposition | null> => {
    if (!persistenceManagerRef.current) return null;

    try {
      console.log('[useDeckPersistence] Restoring deck');
      
      const deck = await persistenceManagerRef.current.restoreDeck(sessionId);
      
      if (deck) {
        setLastError(null);
      } else {
        setLastError('Failed to restore deck');
      }
      
      return deck;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      return null;
    }
  }, [sessionId]);

  const submitDeck = useCallback(async () => {
    if (!socketHandlerRef.current) {
      return { success: false, error: 'Not connected to session' };
    }

    try {
      console.log('[useDeckPersistence] Submitting deck');
      
      const result = await socketHandlerRef.current.submitDeck();
      
      if (result.success) {
        setLastError(null);
      } else {
        setLastError(result.error || 'Submission failed');
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, []);

  // Validation
  const validateDeck = useCallback(async (): Promise<DeckValidationResult> => {
    if (!persistenceManagerRef.current) {
      throw new Error('Persistence manager not available');
    }

    try {
      console.log('[useDeckPersistence] Validating deck');
      
      const result = await persistenceManagerRef.current.validateDeck();
      setLastError(null);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setLastError(errorMessage);
      throw error;
    }
  }, []);

  // Auto-save effect
  useEffect(() => {
    if (!persistenceManagerRef.current) return;

    const autoSaveInterval = setInterval(() => {
      const state = persistenceManagerRef.current?.getState();
      if (state?.isDirty) {
        console.log('[useDeckPersistence] Auto-saving deck');
        persistenceManagerRef.current?.saveDeck();
      }
    }, 10000); // Auto-save every 10 seconds

    return () => clearInterval(autoSaveInterval);
  }, []);

  // Get current state (typed DeckComposition)
  const deckState = persistenceManagerRef.current?.getState();
  const currentDeck = deckState || null;
  const isDirty = deckState?.isDirty ?? false;
  const isRestoring = deckState?.isRestoring ?? false;
  const isValidating = deckState?.isValidating ?? false;
  const hasErrors = deckState?.hasErrors ?? false;
  const metrics = deckState?.metrics || null;

  return {
    // Deck state
    currentDeck,
    isDirty,
    isRestoring,
    isValidating,
    hasErrors,
    
    // Core deck operations
    addStandardCards,
    removeCard,
    moveToSideboard,
    moveToMainboard,
    
    // Persistence operations
    saveDeck,
    restoreDeck,
    submitDeck,
    
    // Validation
    validateDeck,
    
    // Metrics
    metrics,
    
    // Error handling
    lastError
  };
}

/**
 * Hook for managing submission coordination
 */
export function useSubmissionCoordination(_sessionId: string, _playerId: string): UseSubmissionCoordinationReturn {
  const waitingManagerRef = useRef<WaitingStateManager | null>(null);
  const socketHandlerRef = useRef<SubmissionSocketHandler | null>(null);
  const [submissionDeadline, setSubmissionDeadline] = useState<number | null>(null);

  // Initialize waiting manager
  useEffect(() => {
    if (!waitingManagerRef.current) {
      waitingManagerRef.current = new WaitingStateManager();
    }
  }, []);

  const startSubmissionWaiting = useCallback((players: string[]) => {
    if (!socketHandlerRef.current) return;

    console.log(`[useSubmissionCoordination] Starting submission waiting for ${players.length} players`);
    socketHandlerRef.current.startSubmissionWaiting(players);
    
    // Set submission deadline (5 minutes from now)
    setSubmissionDeadline(Date.now() + (5 * 60 * 1000));
  }, []);

  const updateSubmissionStatus = useCallback((status: PlayerStatus, progress?: Record<string, unknown>) => {
    if (!socketHandlerRef.current) return;

    console.log(`[useSubmissionCoordination] Updating submission status: ${status}`);
    socketHandlerRef.current.updateSubmissionStatus(status, progress);
  }, []);

  // Calculate time remaining
  const timeRemaining = submissionDeadline ? Math.max(0, submissionDeadline - Date.now()) : null;

  const waitingState = waitingManagerRef.current?.getWaitingState() || null;
  const coordinationState = waitingManagerRef.current?.getCoordinationState();

  return {
    // Submission state
    isSubmissionActive: waitingState !== null,
    playersSubmitted: coordinationState?.playersSubmitted || [],
    playersBuilding: coordinationState?.playersBuilding || [],
    allPlayersReady: coordinationState?.allPlayersReady || false,
    
    // Submission actions
    startSubmissionWaiting,
    updateSubmissionStatus,
    
    // Waiting overlay
    waitingState,
    
    // Coordination data
    submissionDeadline,
    timeRemaining
  };
}

/**
 * Hook for deck undo/redo functionality
 */
export function useDeckUndoRedo(sessionId: string, playerId: string): UseDeckUndoRedoReturn {
  const persistenceManagerRef = useRef<DeckPersistenceManager | null>(null);

  useEffect(() => {
    if (!persistenceManagerRef.current) {
      persistenceManagerRef.current = new DeckPersistenceManager();
      persistenceManagerRef.current.initializeSession(sessionId);
    }
  }, [sessionId, playerId]);

  const undo = useCallback(async (): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log('[useDeckUndoRedo] Performing undo');
      const success = await persistenceManagerRef.current.undo();
      return success;
    } catch (error) {
      console.error('[useDeckUndoRedo] Undo failed:', error);
      return false;
    }
  }, []);

  const redo = useCallback(async (): Promise<boolean> => {
    if (!persistenceManagerRef.current) return false;

    try {
      console.log('[useDeckUndoRedo] Performing redo');
      const success = await persistenceManagerRef.current.redo();
      return success;
    } catch (error) {
      console.error('[useDeckUndoRedo] Redo failed:', error);
      return false;
    }
  }, []);

  const clearHistory = useCallback(() => {
    if (!persistenceManagerRef.current) return;

    console.log('[useDeckUndoRedo] Clearing history');
    persistenceManagerRef.current.clearHistory();
  }, []);

  const undoRedo = persistenceManagerRef.current?.getUndoRedoState();

  return {
    // Undo/Redo state
    canUndo: undoRedo?.canUndo ?? false,
    canRedo: undoRedo?.canRedo ?? false,
    historySize: undoRedo?.currentHistorySize ?? 0,
    
    // Actions
    undo,
    redo,
    clearHistory,
    
    // History inspection
    undoStack: undoRedo?.undoStack || [],
    redoStack: undoRedo?.redoStack || []
  };
}

/**
 * Hook for deck validation functionality
 */
export function useDeckValidation(): UseDeckValidationReturn {
  const persistenceManagerRef = useRef<DeckPersistenceManager | null>(null);
  const [validationResult, setValidationResult] = useState<DeckValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const validateDeck = useCallback(async (): Promise<DeckValidationResult> => {
    if (!persistenceManagerRef.current) {
      throw new Error('Persistence manager not available');
    }

    setIsValidating(true);
    
    try {
      console.log('[useDeckValidation] Validating deck');
      const result = await persistenceManagerRef.current.validateDeck();
      setValidationResult(result);
      return result;
    } catch (error) {
      console.error('[useDeckValidation] Validation failed:', error);
      throw error;
    } finally {
      setIsValidating(false);
    }
  }, []);

  const autoFixErrors = useCallback(async (): Promise<boolean> => {
    if (!persistenceManagerRef.current || !validationResult) return false;

    try {
      console.log('[useDeckValidation] Auto-fixing errors');
      // Would implement auto-fix logic in persistence manager
      return false; // Not implemented yet
    } catch (error) {
      console.error('[useDeckValidation] Auto-fix failed:', error);
      return false;
    }
  }, [validationResult]);

  const criticalErrors = validationResult?.errors
    .filter(error => error.severity === 'critical')
    .map(error => error.message) || [];

  const warnings = validationResult?.warnings.map(warning => warning.message) || [];

  return {
    // Validation state
    isValid: validationResult?.isValid || false,
    isValidating,
    validationResult,
    
    // Validation actions
    validateDeck,
    autoFixErrors,
    
    // Error analysis
    criticalErrors,
    warnings,
    hasIntegrityIssues: !validationResult?.hashVerified || !validationResult?.draftedCardsIntact
  };
}

/**
 * Hook for deck persistence metrics and monitoring
 */
export function usePersistenceMetrics() {
  const persistenceManagerRef = useRef<DeckPersistenceManager | null>(null);

  const broadcastMetrics = useCallback(() => {
    // Would broadcast metrics through socket handler
    console.log('[usePersistenceMetrics] Broadcasting metrics');
  }, []);

  const state = persistenceManagerRef.current?.getState();
  const metrics = state?.metrics;

  return {
    metrics,
    broadcastMetrics,
    
    // Quick access to common metrics
    persistenceTime: metrics?.persistenceTime || 0,
    restorationTime: metrics?.restorationTime || 0,
    validationTime: metrics?.validationTime || 0,
    storageQuotaUsed: metrics?.storageQuotaUsed || 0,
    
    // Performance indicators
    isSlowPersistence: (metrics?.persistenceTime || 0) > 1000,
    isQuotaNearFull: (metrics?.storageQuotaUsed || 0) > 80,
    hasStorageIssues: !metrics?.sessionStorageAvailable || !metrics?.localStorageAvailable
  };
}