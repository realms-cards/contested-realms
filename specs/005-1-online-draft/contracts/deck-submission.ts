/**
 * Socket.io Event Contracts for Deck Submission
 * Strongly typed interfaces for deck building and submission events
 */

import type { Card } from './types';

// ============================================================================
// Client → Server Events
// ============================================================================

/**
 * Event: draft:deck_submit
 * Sent when a player submits their completed deck
 */
export interface DeckSubmitRequest {
  sessionId: string;
  playerId: string;
  mainDeck: Card[];
  sideboard: Card[];
  timestamp: number;
  
  metadata: {
    deckName?: string;
    colorIdentity: string[];
    totalCards: number;
    averageManaCost: number;
  };
}

export interface DeckSubmitResponse {
  success: boolean;
  submissionId?: string;
  error?: string;
  validation?: {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
}

/**
 * Event: draft:deck_save
 * Sent to save deck progress without submitting
 */
export interface DeckSaveRequest {
  sessionId: string;
  playerId: string;
  mainDeck: Card[];
  sideboard: Card[];
  autoSave: boolean;
  timestamp: number;
}

export interface DeckSaveResponse {
  success: boolean;
  savedAt?: number;
  error?: string;
}

/**
 * Event: draft:deck_recall
 * Sent to recall a submitted deck for editing
 */
export interface DeckRecallRequest {
  sessionId: string;
  playerId: string;
  submissionId: string;
  reason?: string;
}

export interface DeckRecallResponse {
  success: boolean;
  mainDeck?: Card[];
  sideboard?: Card[];
  error?: string;
}

/**
 * Event: draft:standard_cards_request
 * Request available Standard Cards for adding to deck
 */
export interface StandardCardsRequest {
  sessionId: string;
  playerId: string;
  filter?: {
    colors?: string[];
    types?: string[];
    manaCost?: number;
    searchText?: string;
  };
}

export interface StandardCardsResponse {
  success: boolean;
  cards?: Card[];
  totalAvailable?: number;
  error?: string;
}

// ============================================================================
// Server → Client Events
// ============================================================================

/**
 * Event: draft:submission_update
 * Server broadcasts submission status updates
 */
export interface SubmissionUpdateEvent {
  sessionId: string;
  timestamp: number;
  
  totalPlayers: number;
  submittedCount: number;
  
  submissions: Array<{
    playerId: string;
    playerName: string;
    status: 'editing' | 'submitted' | 'recalled';
    submittedAt?: number;
    deckSize?: number;
  }>;
  
  waitingFor: Array<{
    playerId: string;
    playerName: string;
    lastActivity: number;
  }>;
  
  timeRemaining?: number; // seconds until forced submission
}

/**
 * Event: draft:all_submitted
 * Server notifies when all players have submitted decks
 */
export interface AllSubmittedEvent {
  sessionId: string;
  timestamp: number;
  nextPhase: 'game_start' | 'waiting_room' | 'tournament';
  transitionDelay: number; // seconds before transition
  
  submissions: Array<{
    playerId: string;
    playerName: string;
    deckSize: number;
    colors: string[];
  }>;
}

/**
 * Event: draft:submission_deadline
 * Server warns about approaching submission deadline
 */
export interface SubmissionDeadlineEvent {
  sessionId: string;
  timeRemaining: number; // seconds
  playersNotSubmitted: Array<{
    playerId: string;
    playerName: string;
  }>;
  autoSubmitAt: number; // timestamp
}

/**
 * Event: draft:deck_validation_error
 * Server notifies of deck validation issues
 */
export interface DeckValidationErrorEvent {
  sessionId: string;
  playerId: string;
  
  validation: {
    isValid: boolean;
    errors: Array<{
      code: string;
      message: string;
      severity: 'error' | 'warning';
      affectedCards?: string[];
    }>;
    
    requirements: {
      minimumDeckSize: number;
      maximumDeckSize: number;
      sideboardLimit: number;
    };
    
    currentStats: {
      mainDeckSize: number;
      sideboardSize: number;
      invalidCards: string[];
    };
  };
}

/**
 * Event: draft:deck_auto_saved
 * Server confirms auto-save of deck progress
 */
export interface DeckAutoSavedEvent {
  sessionId: string;
  playerId: string;
  savedAt: number;
  mainDeckSize: number;
  sideboardSize: number;
  version: number; // increments with each save
}

// ============================================================================
// Waiting Overlay Specific Events
// ============================================================================

/**
 * Event: draft:waiting_overlay_show
 * Server triggers waiting overlay display
 */
export interface WaitingOverlayShowEvent {
  sessionId: string;
  reason: 'deck_submission' | 'round_transition' | 'game_start';
  
  display: {
    title: string;
    message: string;
    showProgress: boolean;
    showPlayerList: boolean;
    allowCancel: boolean;
  };
  
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  
  estimatedWaitTime?: number; // seconds
}

/**
 * Event: draft:waiting_overlay_update
 * Server updates waiting overlay content
 */
export interface WaitingOverlayUpdateEvent {
  sessionId: string;
  
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  
  message?: string;
  playersUpdate?: Array<{
    playerId: string;
    playerName: string;
    status: 'waiting' | 'ready' | 'timeout';
  }>;
  
  timeRemaining?: number; // seconds
  allowContinue?: boolean; // enable continue without all players
}

/**
 * Event: draft:waiting_overlay_hide
 * Server triggers waiting overlay dismissal
 */
export interface WaitingOverlayHideEvent {
  sessionId: string;
  reason: 'all_ready' | 'timeout' | 'cancelled' | 'error';
  nextAction?: 'continue' | 'return_to_lobby' | 'start_game';
}

// ============================================================================
// Socket.io Namespace Types
// ============================================================================

export interface DeckClientToServerEvents {
  'draft:deck_submit': (data: DeckSubmitRequest, callback: (response: DeckSubmitResponse) => void) => void;
  'draft:deck_save': (data: DeckSaveRequest, callback: (response: DeckSaveResponse) => void) => void;
  'draft:deck_recall': (data: DeckRecallRequest, callback: (response: DeckRecallResponse) => void) => void;
  'draft:standard_cards_request': (data: StandardCardsRequest, callback: (response: StandardCardsResponse) => void) => void;
}

export interface DeckServerToClientEvents {
  'draft:submission_update': (data: SubmissionUpdateEvent) => void;
  'draft:all_submitted': (data: AllSubmittedEvent) => void;
  'draft:submission_deadline': (data: SubmissionDeadlineEvent) => void;
  'draft:deck_validation_error': (data: DeckValidationErrorEvent) => void;
  'draft:deck_auto_saved': (data: DeckAutoSavedEvent) => void;
  'draft:waiting_overlay_show': (data: WaitingOverlayShowEvent) => void;
  'draft:waiting_overlay_update': (data: WaitingOverlayUpdateEvent) => void;
  'draft:waiting_overlay_hide': (data: WaitingOverlayHideEvent) => void;
}

// ============================================================================
// Validation Functions
// ============================================================================

export function isDeckSubmitRequest(data: unknown): data is DeckSubmitRequest {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'playerId' in data &&
    'mainDeck' in data &&
    Array.isArray((data as Record<string, unknown>).mainDeck)
  );
}

export function isSubmissionUpdateEvent(data: unknown): data is SubmissionUpdateEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'totalPlayers' in data &&
    'submittedCount' in data
  );
}

export function isWaitingOverlayShowEvent(data: unknown): data is WaitingOverlayShowEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'sessionId' in data &&
    'reason' in data &&
    'display' in data
  );
}