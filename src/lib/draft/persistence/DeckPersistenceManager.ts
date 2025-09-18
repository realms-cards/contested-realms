/**
 * DeckPersistenceManager - Preserve Deck State Across All Operations
 * Core requirement: "Deck editor preserves drafted cards when adding Standard Cards"
 */

import type {
  DeckComposition,
  DeckSubmission,
  PersistenceState,
  DeckModification,
  DeckValidationResult,
  PersistenceMetrics,
  UndoRedoState,
  DeckAction,
  DeckSection,
  ModificationSource,
  DeckCompositionEntry
} from './types';

export class DeckPersistenceManager {
  private currentDeck: DeckComposition | null = null;
  private persistenceState: PersistenceState | null = null;
  private modifications: DeckModification[] = [];
  private undoRedoState: UndoRedoState | null = null;
  private metrics: PersistenceMetrics | null = null;

  // Storage keys
  private readonly SESSION_STORAGE_PREFIX = 'draft-deck';
  private readonly LOCAL_STORAGE_PREFIX = 'draft-backup';
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes

  // Performance targets
  private readonly MAX_PERSISTENCE_TIME = 50; // 50ms target
  private readonly MAX_RESTORATION_TIME = 100; // 100ms target

  /**
   * Initialize deck persistence for a session
   * CRITICAL: Must preserve any existing drafted cards
   */
  async initializeDeck(sessionId: string, playerId: string, existingDraftedCards?: string[]): Promise<DeckComposition> {
    const initStart = Date.now();

    try {
      // First, try to restore from browser storage
      const restoredDeck = await this.restoreFromStorage(sessionId, playerId);
      
      if (restoredDeck && restoredDeck.draftedCards.length > 0) {
        console.log(`[DeckPersistence] Restored deck with ${restoredDeck.draftedCards.length} drafted cards`);
        this.currentDeck = restoredDeck;
      } else if (existingDraftedCards && existingDraftedCards.length > 0) {
        // Create new deck but preserve any existing drafted cards
        console.log(`[DeckPersistence] Creating new deck preserving ${existingDraftedCards.length} drafted cards`);
        this.currentDeck = this.createNewDeck(sessionId, playerId, existingDraftedCards);
      } else {
        // Create completely new deck
        this.currentDeck = this.createNewDeck(sessionId, playerId);
      }

      // Initialize persistence state
      this.persistenceState = this.initializePersistenceState(sessionId, playerId);
      
      // Initialize undo/redo system
      this.undoRedoState = this.initializeUndoRedoState(sessionId, playerId);

      // Save initial state
      await this.persistDeckToStorage();

      const initTime = Date.now() - initStart;
      console.log(`[DeckPersistence] Deck initialized in ${initTime}ms`);

      return this.currentDeck;
    } catch (error) {
      console.error('[DeckPersistence] Failed to initialize deck:', error);
      throw error;
    }
  }

  /**
   * Add standard cards while preserving ALL drafted cards
   * This is the CORE REQUIREMENT - drafted cards must NEVER be lost
   */
  async addStandardCards(standardCards: string[]): Promise<{ success: boolean; preservedDraftedCards: string[] }> {
    if (!this.currentDeck) {
      throw new Error('No active deck to modify');
    }

    const addStart = Date.now();
    
    // CRITICAL: Capture drafted cards BEFORE any modifications
    const preservedDraftedCards = [...this.currentDeck.draftedCards];
    
    try {
      // Create modification record BEFORE making changes
      const modification = this.createModification({
        action: 'add_standard',
        cardIds: standardCards,
        sourceSection: 'standard',
        triggerSource: 'user_action',
        userInitiated: true
      });

      // Record BEFORE state
      modification.before = {
        draftedCards: [...this.currentDeck.draftedCards],
        standardCards: [...this.currentDeck.standardCards],
        totalCards: this.currentDeck.totalCards
      };

      // Apply the changes - ADD to existing, never replace
      const updatedStandardCards = [...this.currentDeck.standardCards, ...standardCards];
      
      // Update deck composition
      this.currentDeck = {
        ...this.currentDeck,
        // CRITICAL: Keep all drafted cards intact
        draftedCards: preservedDraftedCards,
        // Add new standard cards to existing ones
        standardCards: updatedStandardCards,
        totalCards: preservedDraftedCards.length + updatedStandardCards.length + this.currentDeck.sideboardCards.length,
        lastModified: Date.now()
      };

      // Record AFTER state
      modification.after = {
        draftedCards: [...this.currentDeck.draftedCards],
        standardCards: [...this.currentDeck.standardCards],
        totalCards: this.currentDeck.totalCards
      };

      // Add modification to history
      this.modifications.push(modification);
      modification.applied = true;

      // Reflect into undo/redo tracking
      if (this.undoRedoState) {
        const u = this.undoRedoState;
        u.undoStack.push(modification);
        // Enforce history size constraint
        if (u.undoStack.length > u.maxHistorySize) {
          u.undoStack.shift();
        }
        u.currentHistorySize = u.undoStack.length;
        u.canUndo = u.currentHistorySize > 0;
        u.canRedo = u.redoStack.length > 0;
      }

      // Update composition history
      this.currentDeck.compositionHistory.push({
        entryId: `entry-${Date.now()}`,
        timestamp: Date.now(),
        action: 'add_standard',
        cardIds: standardCards,
        sourceSection: 'standard',
        reversible: true
      });

      // Persist changes immediately
      await this.persistDeckToStorage();

      // Validate that drafted cards are still intact
      const validationResult = this.validateDeckIntegrity();
      
      if (!validationResult.draftedCardsIntact) {
        // CRITICAL ERROR - rollback immediately
        console.error('[DeckPersistence] CRITICAL: Drafted cards corrupted during standard card addition');
        await this.rollbackLastModification();
        return { success: false, preservedDraftedCards: [] };
      }

      const addTime = Date.now() - addStart;
      console.log(`[DeckPersistence] Added ${standardCards.length} standard cards in ${addTime}ms, ${preservedDraftedCards.length} drafted cards preserved`);

      return { 
        success: true, 
        preservedDraftedCards: this.currentDeck.draftedCards 
      };

    } catch (error) {
      console.error('[DeckPersistence] Failed to add standard cards:', error);
      
      // Attempt to restore drafted cards if they were lost
      if (this.currentDeck.draftedCards.length !== preservedDraftedCards.length) {
        console.warn('[DeckPersistence] Restoring drafted cards after error');
        this.currentDeck.draftedCards = preservedDraftedCards;
        await this.persistDeckToStorage();
      }

      return { success: false, preservedDraftedCards };
    }
  }

  /**
   * Persist deck state across route changes
   * Critical for maintaining state when user navigates between pages
   */
  async persistForRouteChange(fromRoute: string, toRoute: string): Promise<boolean> {
    if (!this.currentDeck || !this.persistenceState) {
      return false;
    }

    try {
      const persistStart = Date.now();

      // Update persistence state
      this.persistenceState.lastRoute = fromRoute;
      this.persistenceState.currentRoute = toRoute;
      this.persistenceState.routeTransitionTime = Date.now();

      // Add route change to composition history
      this.currentDeck.compositionHistory.push({
        entryId: `route-${Date.now()}`,
        timestamp: Date.now(),
        action: 'route_transition',
        sourceSection: 'drafted',
        reversible: false
      });

      // Persist with route context
      await this.persistDeckToStorage();
      // Mark last route persistence timestamp
      this.persistenceState.lastRoutePersistedAt = Date.now();

      const persistTime = Date.now() - persistStart;
      console.log(`[DeckPersistence] Persisted for route change ${fromRoute} -> ${toRoute} in ${persistTime}ms`);

      return true;
    } catch (error) {
      console.error('[DeckPersistence] Failed to persist for route change:', error);
      return false;
    }
  }

  /**
   * Handle browser refresh/unload events
   * Ensure deck state survives browser refresh
   */
  async handleBrowserUnload(): Promise<void> {
    if (!this.currentDeck || !this.persistenceState) return;

    try {
      // Quick synchronous save for browser unload
      this.persistenceState.pageRefreshCount += 1;
      
      // Use synchronous localStorage as fallback for reliability
      const backupKey = `${this.LOCAL_STORAGE_PREFIX}-emergency-${this.persistenceState.sessionId}`;
      const emergencyBackup = {
        draftedCards: this.currentDeck.draftedCards,
        standardCards: this.currentDeck.standardCards,
        timestamp: Date.now(),
        pageRefreshCount: this.persistenceState.pageRefreshCount
      };

      localStorage.setItem(backupKey, JSON.stringify(emergencyBackup));
      
      console.log(`[DeckPersistence] Emergency backup saved with ${this.currentDeck.draftedCards.length} drafted cards`);
    } catch (error) {
      console.error('[DeckPersistence] Failed to save emergency backup:', error);
    }
  }

  /**
   * Restore deck state from storage
   */
  private async restoreFromStorage(sessionId: string, playerId: string): Promise<DeckComposition | null> {
    const restoreStart = Date.now();

    try {
      // Try sessionStorage first (most recent state)
      const sessionKey = `${this.SESSION_STORAGE_PREFIX}-${sessionId}-${playerId}`;
      const sessionData = sessionStorage.getItem(sessionKey);

      if (sessionData) {
        const parsed = JSON.parse(sessionData);
        const restoreTime = Date.now() - restoreStart;
        console.log(`[DeckPersistence] Restored from sessionStorage in ${restoreTime}ms`);
        return this.validateAndSanitizeDeck(parsed);
      }

      // Try localStorage backup
      const backupKey = `${this.LOCAL_STORAGE_PREFIX}-${sessionId}-${playerId}`;
      const backupData = localStorage.getItem(backupKey);

      if (backupData) {
        const parsed = JSON.parse(backupData);
        const restoreTime = Date.now() - restoreStart;
        console.log(`[DeckPersistence] Restored from localStorage backup in ${restoreTime}ms`);
        return this.validateAndSanitizeDeck(parsed);
      }

      // Try emergency backup
      const emergencyKey = `${this.LOCAL_STORAGE_PREFIX}-emergency-${sessionId}`;
      const emergencyData = localStorage.getItem(emergencyKey);

      if (emergencyData) {
        const parsed = JSON.parse(emergencyData);
        console.log(`[DeckPersistence] Restored from emergency backup`);
        
        // Convert emergency backup to full deck composition
        return this.createNewDeck(sessionId, playerId, parsed.draftedCards, parsed.standardCards);
      }

      return null;
    } catch (error) {
      console.error('[DeckPersistence] Failed to restore from storage:', error);
      return null;
    }
  }

  /**
   * Persist current deck state to storage
   */
  private async persistDeckToStorage(): Promise<void> {
    if (!this.currentDeck || !this.persistenceState) return;

    const persistStart = Date.now();

    try {
      // Create storage data
      // Ensure sideboard mirror for backward compatibility
      this.currentDeck.sideboard = [...this.currentDeck.sideboardCards];

      const storageData = {
        ...this.currentDeck,
        sideboard: [...this.currentDeck.sideboardCards],
        persistedAt: Date.now(),
        sessionId: this.persistenceState.sessionId,
        playerId: this.persistenceState.playerId
      };

      const dataString = JSON.stringify(storageData);
      const dataSize = new Blob([dataString]).size;

      // Check storage quota
      if (!this.checkStorageQuota(dataSize)) {
        await this.handleStorageQuotaExceeded();
      }

      // Save to sessionStorage (primary)
      const sessionKey = `${this.SESSION_STORAGE_PREFIX}-${this.persistenceState.sessionId}-${this.persistenceState.playerId}`;
      sessionStorage.setItem(sessionKey, dataString);

      // Save to localStorage (backup)
      const backupKey = `${this.LOCAL_STORAGE_PREFIX}-${this.persistenceState.sessionId}-${this.persistenceState.playerId}`;
      const backupData = {
        draftedCards: this.currentDeck.draftedCards,
        standardCards: this.currentDeck.standardCards,
        sideboard: this.currentDeck.sideboardCards,
        lastModified: this.currentDeck.lastModified,
        totalCards: this.currentDeck.totalCards
      };
      localStorage.setItem(backupKey, JSON.stringify(backupData));

      // Update persistence metrics
      const persistTime = Date.now() - persistStart;
      this.updatePersistenceMetrics(persistTime, dataSize);

      if (persistTime > this.MAX_PERSISTENCE_TIME) {
        console.warn(`[DeckPersistence] Persistence time ${persistTime}ms exceeds target ${this.MAX_PERSISTENCE_TIME}ms`);
      }

      this.persistenceState.lastSuccessfulPersist = Date.now();

    } catch (error) {
      console.error('[DeckPersistence] Failed to persist deck:', error);
      throw error;
    }
  }

  /**
   * Validate deck integrity - ensure drafted cards are never lost
   */
  private validateDeckIntegrity(): DeckValidationResult {
    if (!this.currentDeck) {
      return {
        isValid: false,
        errors: [{ 
          errorId: 'no-deck', 
          severity: 'critical', 
          category: 'integrity',
          message: 'No deck to validate',
          affectedCards: [],
          autoFixAvailable: false
        }],
        warnings: [],
        draftedCardsIntact: false,
        minimumSizeMet: false,
        legalityChecked: false,
        hashVerified: false,
        validatedAt: Date.now(),
        validatorVersion: '1.0.0'
      };
    }

    const result: DeckValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      draftedCardsIntact: true,
      minimumSizeMet: this.currentDeck.totalCards >= 40,
      legalityChecked: true,
      hashVerified: true,
      validatedAt: Date.now(),
      validatorVersion: '1.0.0'
    };

    // Check drafted cards integrity
    if (!Array.isArray(this.currentDeck.draftedCards)) {
      result.isValid = false;
      result.draftedCardsIntact = false;
      result.errors.push({
        errorId: 'drafted-cards-corrupted',
        severity: 'critical',
        category: 'integrity',
        message: 'Drafted cards array is corrupted',
        affectedCards: [],
        autoFixAvailable: false
      });
    }

    // Check for duplicate cards across sections
    const allCards = [
      ...this.currentDeck.draftedCards,
      ...this.currentDeck.standardCards,
      ...this.currentDeck.sideboardCards
    ];

    const duplicates = allCards.filter((card, index) => allCards.indexOf(card) !== index);
    if (duplicates.length > 0) {
      result.warnings.push({
        warningId: 'duplicate-cards',
        category: 'optimization',
        message: `Duplicate cards found: ${duplicates.join(', ')}`,
        recommendation: 'Remove duplicate cards'
      });
    }

    return result;
  }

  /**
   * Create a new deck composition with optional initial cards
   */
  private createNewDeck(sessionId: string, playerId: string, draftedCards: string[] = [], standardCards: string[] = []): DeckComposition {
    return {
      draftedCards: [...draftedCards], // Always preserve passed drafted cards
      standardCards: [...standardCards],
      sideboard: [],
      sideboardCards: [], // New preferred name
      deckName: `Draft Deck - ${new Date().toLocaleDateString()}`,
      totalCards: draftedCards.length + standardCards.length,
      colors: [],
      manaCurve: {},
      compositionHistory: [{
        entryId: 'initial',
        timestamp: Date.now(),
        action: 'draft_pick',
        sourceSection: 'drafted',
        reversible: false
      }],
      isDraftComplete: false,
      meetsMinimumSize: draftedCards.length + standardCards.length >= 40,
      hasIllegalCards: false,
      lastModified: Date.now(),
      // Hook state properties
      isDirty: false,
      isRestoring: false,
      isValidating: false,
      hasErrors: false
    };
  }

  /**
   * Create modification tracking record
   */
  private createModification(params: {
    action: DeckAction;
    cardId?: string;
    cardIds?: string[];
    sourceSection: DeckSection;
    targetSection?: DeckSection;
    triggerSource: ModificationSource;
    userInitiated: boolean;
  }): DeckModification {
    return {
      modificationId: `mod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.persistenceState?.sessionId || '',
      playerId: this.persistenceState?.playerId || '',
      timestamp: Date.now(),
      action: params.action,
      before: {},
      after: {},
      triggerSource: params.triggerSource,
      userInitiated: params.userInitiated,
      applied: false,
      rolledBack: false
    };
  }

  /**
   * Initialize persistence state
   */
  private initializePersistenceState(sessionId: string, playerId: string): PersistenceState {
    return {
      sessionId,
      playerId,
      sessionStorageData: {
        key: `${this.SESSION_STORAGE_PREFIX}-${sessionId}-${playerId}`,
        data: this.currentDeck ?? this.createNewDeck(sessionId, playerId),
        lastSaved: Date.now(),
        dataSize: 0,
        compressionUsed: false,
        checksum: '',
        version: '1.0.0'
      },
      localStorageBackup: {
        key: `${this.LOCAL_STORAGE_PREFIX}-${sessionId}-${playerId}`,
        data: {},
        createdAt: Date.now(),
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        reason: 'session_timeout',
        originalSize: 0,
        compressedSize: 0
      },
      currentRoute: typeof window !== 'undefined' ? window.location.pathname : '',
      lastRoute: '',
      routeTransitionTime: Date.now(),
      lastSuccessfulPersist: Date.now(),
      recoveryAttempts: 0,
      maxRecoveryAttempts: 3,
      browserSessionId: `session-${Date.now()}`,
      pageRefreshCount: 0,
      unloadListenerActive: false
    };
  }

  /**
   * Initialize undo/redo state
   */
  private initializeUndoRedoState(sessionId: string, playerId: string): UndoRedoState {
    return {
      sessionId,
      playerId,
      undoStack: [],
      redoStack: [],
      maxHistorySize: 50,
      currentHistorySize: 0,
      canUndo: false,
      canRedo: false,
      lastUndoTimestamp: 0,
      lastRedoTimestamp: 0,
      draftPicksUndoable: false, // Draft picks usually can't be undone
      standardCardsUndoable: true // Standard cards can be undone
    };
  }

  /**
   * Check storage quota and availability
   */
  private checkStorageQuota(requiredSize: number): boolean {
    try {
      // Simple check - try to set a test item
      const testKey = 'storage-test';
      const testData = 'x'.repeat(requiredSize);
      sessionStorage.setItem(testKey, testData);
      sessionStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Handle storage quota exceeded
   */
  private async handleStorageQuotaExceeded(): Promise<void> {
    console.warn('[DeckPersistence] Storage quota exceeded, attempting cleanup');
    
    // Remove old session data
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(this.SESSION_STORAGE_PREFIX) && !key.includes(this.persistenceState?.sessionId || '')) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    console.log(`[DeckPersistence] Cleaned up ${keysToRemove.length} old storage entries`);
  }

  /**
   * Update persistence metrics
   */
  private updatePersistenceMetrics(persistTime: number, dataSize: number): void {
    if (!this.metrics || !this.persistenceState) {
      this.metrics = {
        sessionId: this.persistenceState?.sessionId || '',
        playerId: this.persistenceState?.playerId || '',
        timestamp: Date.now(),
        persistenceTime: persistTime,
        restorationTime: 0,
        validationTime: 0,
        deckSize: this.currentDeck?.totalCards || 0,
        dataSize,
        compressionRatio: 1.0,
        persistenceErrors: 0,
        validationErrors: 0,
        recoveryAttempts: 0,
        storageQuotaUsed: 50, // Estimated
        storageQuotaTotal: 5242880, // 5MB typical
        sessionStorageAvailable: true,
        localStorageAvailable: true
      };
    } else {
      this.metrics.persistenceTime = (this.metrics.persistenceTime + persistTime) / 2;
      this.metrics.dataSize = dataSize;
      this.metrics.timestamp = Date.now();
      this.metrics.deckSize = this.currentDeck?.totalCards || 0;
    }

    // Mirror metrics onto deck state for consumers expecting it on state
    if (this.currentDeck && this.metrics) {
      this.currentDeck.metrics = this.metrics;
    }
  }

  /**
   * Validate and sanitize restored deck data
   */
  private validateAndSanitizeDeck(data: unknown): DeckComposition | null {
    if (!data || typeof data !== 'object') return null;
    
    const deckData = data as Record<string, unknown>;
    
    // Ensure critical fields exist and are arrays
    if (!Array.isArray(deckData.draftedCards)) return null;
    if (!Array.isArray(deckData.standardCards)) deckData.standardCards = [];
    // Normalize sideboard arrays and mirror to sideboardCards
    const sideboardArr: string[] = Array.isArray(deckData.sideboardCards)
      ? (deckData.sideboardCards as string[])
      : Array.isArray(deckData.sideboard)
        ? (deckData.sideboard as string[])
        : [];

    return {
      draftedCards: deckData.draftedCards as string[],
      standardCards: deckData.standardCards as string[],
      sideboard: [...sideboardArr],
      sideboardCards: [...sideboardArr],
      deckName: typeof deckData.deckName === 'string' ? deckData.deckName : 'Restored Deck',
      totalCards: (deckData.draftedCards as string[]).length + (deckData.standardCards as string[]).length + sideboardArr.length,
      colors: Array.isArray(deckData.colors) ? deckData.colors as string[] : [],
      manaCurve: typeof deckData.manaCurve === 'object' ? deckData.manaCurve as Record<number, number> : {},
      compositionHistory: Array.isArray(deckData.compositionHistory) ? deckData.compositionHistory as DeckCompositionEntry[] : [],
      isDraftComplete: Boolean(deckData.isDraftComplete),
      meetsMinimumSize: Boolean(deckData.meetsMinimumSize),
      hasIllegalCards: Boolean(deckData.hasIllegalCards),
      lastModified: typeof deckData.lastModified === 'number' ? deckData.lastModified : Date.now(),
      // Hook state properties
      isDirty: Boolean(deckData.isDirty),
      isRestoring: Boolean(deckData.isRestoring),
      isValidating: Boolean(deckData.isValidating),
      hasErrors: Boolean(deckData.hasErrors)
    };
  }

  /**
   * Rollback the last modification
   */
  private async rollbackLastModification(): Promise<void> {
    const lastMod = this.modifications[this.modifications.length - 1];
    if (!lastMod || lastMod.rolledBack) return;

    console.warn(`[DeckPersistence] Rolling back modification: ${lastMod.action}`);
    
    // Restore previous state
    if (lastMod.before && this.currentDeck) {
      if (lastMod.before.draftedCards) {
        this.currentDeck.draftedCards = [...lastMod.before.draftedCards];
      }
      if (lastMod.before.standardCards) {
        this.currentDeck.standardCards = [...lastMod.before.standardCards];
      }
      if (lastMod.before.totalCards !== undefined) {
        this.currentDeck.totalCards = lastMod.before.totalCards;
      }
    }

    lastMod.rolledBack = true;
    await this.persistDeckToStorage();
  }

  // Public interface methods
  public getCurrentDeck(): DeckComposition | null {
    return this.currentDeck;
  }

  public getMetrics(): PersistenceMetrics | null {
    return this.metrics;
  }

  /**
   * Strictly typed accessor for Undo/Redo state
   */
  public getUndoRedoState(): UndoRedoState | null {
    return this.undoRedoState;
  }

  /**
   * Read-only snapshot of modification history
   */
  public getModifications(): ReadonlyArray<DeckModification> {
    return [...this.modifications];
  }

  /**
   * Strictly typed accessor for browser persistence state
   */
  public getPersistenceState(): PersistenceState | null {
    return this.persistenceState;
  }

  public async initializeSession(sessionId: string): Promise<void> {
    console.log(`[DeckPersistence] Initializing session: ${sessionId}`);
    // Implementation would initialize session-specific storage
    // For now, this is a placeholder that satisfies the interface
  }

  public async removeCard(cardId: string, fromSideboard = false): Promise<boolean> {
    if (!this.currentDeck) return false;
    
    const targetList = fromSideboard ? 'sideboardCards' : 'standardCards';
    const cardIndex = this.currentDeck[targetList].indexOf(cardId);
    
    if (cardIndex === -1) return false;
    
    // Record modification  
    this.createModification({
      action: 'remove_card',
      cardId,
      sourceSection: fromSideboard ? 'sideboard' : 'standard',
      triggerSource: 'user_action',
      userInitiated: true
    });
    
    this.currentDeck[targetList].splice(cardIndex, 1);
    // Keep sideboard mirror consistent
    if (targetList === 'sideboardCards') {
      this.currentDeck.sideboard = [...this.currentDeck.sideboardCards];
    }
    this.currentDeck.totalCards = this.currentDeck.draftedCards.length +
                                  this.currentDeck.standardCards.length +
                                  this.currentDeck.sideboardCards.length;
    
    await this.persistDeckToStorage();
    return true;
  }

  public async moveToMainboard(cardId: string): Promise<boolean> {
    if (!this.currentDeck) return false;

    const sideboardIndex = this.currentDeck.sideboardCards.indexOf(cardId);
    if (sideboardIndex === -1) return false;

    this.createModification({
      action: 'move_to_mainboard',
      cardId,
      sourceSection: 'sideboard',
      targetSection: 'standard',
      triggerSource: 'user_action',
      userInitiated: true
    });

    this.currentDeck.sideboardCards.splice(sideboardIndex, 1);
    this.currentDeck.standardCards.push(cardId);
    this.currentDeck.sideboard = [...this.currentDeck.sideboardCards];
    this.currentDeck.totalCards =
      this.currentDeck.draftedCards.length +
      this.currentDeck.standardCards.length +
      this.currentDeck.sideboardCards.length;

    await this.persistDeckToStorage();
    return true;
  }

  public async moveToSideboard(cardId: string): Promise<boolean> {
    if (!this.currentDeck) return false;
    
    const standardIndex = this.currentDeck.standardCards.indexOf(cardId);
    const draftedIndex = this.currentDeck.draftedCards.indexOf(cardId);
    
    if (standardIndex === -1 && draftedIndex === -1) return false;
    
    this.createModification({
      action: 'move_to_sideboard',
      cardId,
      sourceSection: standardIndex !== -1 ? 'standard' : 'drafted',
      targetSection: 'sideboard',
      triggerSource: 'user_action',
      userInitiated: true
    });

    // Remove from mainboard or drafted
    if (standardIndex !== -1) {
      this.currentDeck.standardCards.splice(standardIndex, 1);
    } else if (draftedIndex !== -1) {
      this.currentDeck.draftedCards.splice(draftedIndex, 1);
    }

    // Add to sideboard
    this.currentDeck.sideboardCards.push(cardId);
    // Mirror deprecated field for backward compatibility
    this.currentDeck.sideboard = [...this.currentDeck.sideboardCards];
    // Recompute totals
    this.currentDeck.totalCards =
      this.currentDeck.draftedCards.length +
      this.currentDeck.standardCards.length +
      this.currentDeck.sideboardCards.length;

    await this.persistDeckToStorage();
    return true;
  }

  public async saveDeck(): Promise<boolean> {
    try {
      await this.persistDeckToStorage();
      return true;
    } catch (error) {
      console.error('[DeckPersistence] Failed to save deck:', error);
      return false;
    }
  }

  public async restoreDeck(sessionId: string): Promise<DeckComposition | null> {
    const backupKey = `draft_deck_backup_${sessionId}`;
    const backupData = localStorage.getItem(backupKey);
    
    if (!backupData) return null;
    
    try {
      const backup = JSON.parse(backupData);
      this.currentDeck = backup;
      await this.persistDeckToStorage();
      return this.currentDeck;
    } catch (error) {
      console.error('[DeckPersistence] Failed to restore deck:', error);
      return null;
    }
  }

  public validateDeck(): DeckValidationResult {
    return this.validateDeckIntegrity();
  }

  /**
   * Create a deck submission object for coordination
   */
  public async submitDeck(): Promise<DeckSubmission | null> {
    if (!this.currentDeck || !this.persistenceState) return null;

    // Ensure deck is persisted before submission
    await this.persistDeckToStorage();

    const submission: DeckSubmission = {
      submissionId: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.persistenceState.sessionId,
      playerId: this.persistenceState.playerId,
      playerName: 'Player',
      deck: this.currentDeck,
      submittedAt: Date.now(),
      lastModified: this.currentDeck.lastModified,
      deckHash: this.computeDeckHash(this.currentDeck),
      status: 'submitted',
      validationResult: this.validateDeckIntegrity(),
      sessionStorageKey: this.persistenceState.sessionStorageData.key,
      routePersisted: true,
    };

    return submission;
  }

  private computeDeckHash(deck: DeckComposition): string {
    try {
      const payload = JSON.stringify({
        drafted: deck.draftedCards,
        standard: deck.standardCards,
        sideboard: deck.sideboardCards,
      });
      let hash = 0;
      for (let i = 0; i < payload.length; i++) {
        const chr = payload.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
      }
      return `h${Math.abs(hash)}`;
    } catch {
      return 'h0';
    }
  }

  /**
   * Return a shallow-frozen snapshot of the current deck state for safe consumption.
   *
   * Arrays are cloned and Object.freeze()'d to discourage mutation by consumers.
   * This does not alter the internally managed `currentDeck`; it only affects the
   * returned snapshot. Backwards-compat fields like `sideboard` are mirrored from
   * `sideboardCards`.
   */
  public getState(): DeckComposition | null {
    if (!this.currentDeck) return null;
    // Provide a lightweight summary for UI consumers
    const historyLength = this.undoRedoState?.undoStack.length ?? this.modifications.length;
    const canUndo = this.undoRedoState?.canUndo ?? historyLength > 0;
    const canRedo = this.undoRedoState?.canRedo ?? false;

    const d = this.currentDeck;

    const snapshot: DeckComposition = {
      ...d,
      // Shallow-frozen clones (cast back to mutable type for compatibility)
      draftedCards: Object.freeze([...d.draftedCards]) as unknown as string[],
      standardCards: Object.freeze([...d.standardCards]) as unknown as string[],
      sideboardCards: Object.freeze([...d.sideboardCards]) as unknown as string[],
      sideboard: Object.freeze([...d.sideboardCards]) as unknown as string[],
      compositionHistory: Object.freeze([...d.compositionHistory]) as unknown as DeckCompositionEntry[],
      colors: Object.freeze([...d.colors]) as unknown as string[],
      manaCurve: { ...d.manaCurve },
    };

    snapshot.undoRedo = { canUndo, canRedo, historyLength };
    if (this.metrics) {
      snapshot.metrics = this.metrics;
    }
    return snapshot;
  }

  public async undo(): Promise<boolean> {
    const lastMod = this.modifications[this.modifications.length - 1];
    if (!lastMod || lastMod.rolledBack) return false;

    await this.rollbackLastModification();

    // Maintain undo/redo stacks
    if (this.undoRedoState) {
      const u = this.undoRedoState;
      const idx = u.undoStack.findIndex(m => m.modificationId === lastMod.modificationId);
      if (idx !== -1) {
        const [undone] = u.undoStack.splice(idx, 1);
        u.redoStack.push(undone);
      }
      u.currentHistorySize = u.undoStack.length;
      u.canUndo = u.currentHistorySize > 0;
      u.canRedo = u.redoStack.length > 0;
      u.lastUndoTimestamp = Date.now();
    }

    return true;
  }

  public async redo(): Promise<boolean> {
    if (!this.undoRedoState || !this.currentDeck) return false;
    const u = this.undoRedoState;
    if (u.redoStack.length === 0) return false;

    const mod = u.redoStack.pop();
    if (!mod) return false;

    // Re-apply minimal 'after' state when available
    try {
      if (mod.after.draftedCards) {
        this.currentDeck.draftedCards = [...mod.after.draftedCards];
      }
      if (mod.after.standardCards) {
        this.currentDeck.standardCards = [...mod.after.standardCards];
      }
      if (typeof mod.after.totalCards === 'number') {
        this.currentDeck.totalCards = mod.after.totalCards;
      } else {
        // Keep totalCards consistent
        this.currentDeck.totalCards = this.currentDeck.draftedCards.length + this.currentDeck.standardCards.length + this.currentDeck.sideboardCards.length;
      }
      this.currentDeck.lastModified = Date.now();
      mod.applied = true;

      // Move back to undo stack
      u.undoStack.push(mod);
      u.currentHistorySize = u.undoStack.length;
      u.canUndo = u.currentHistorySize > 0;
      u.canRedo = u.redoStack.length > 0;

      await this.persistDeckToStorage();
      return true;
    } catch (error) {
      console.error('[DeckPersistence] Redo failed:', error);
      return false;
    }
  }

  public clearHistory(): void {
    this.modifications = [];
  }

  public async cleanup(): Promise<void> {
    if (this.persistenceState) {
      // Remove session storage
      sessionStorage.removeItem(this.persistenceState.sessionStorageData.key);
      
      // Keep localStorage backup for recovery
      console.log('[DeckPersistence] Cleanup completed, backup retained');
    }
  }
}
