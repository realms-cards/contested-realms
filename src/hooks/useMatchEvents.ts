import { useState, useEffect, useCallback } from 'react';

export interface MatchEvent {
  id: string;
  timestamp: number;
  type: 'player_joined' | 'player_left' | 'player_disconnected' | 'player_reconnected' |
        'match_started' | 'match_ended' | 'game_started' | 'game_ended' |
        'round_started' | 'pairings_announced' | 'tournament_started' | 'player_eliminated';
  message: string;
  metadata?: {
    playerId?: string;
    playerName?: string;
    winnerId?: string;
    winnerName?: string;
    isDraw?: boolean;
    roundNumber?: number;
    matchId?: string;
  };
}

interface UseMatchEventsOptions {
  matchId?: string | null;
  tournamentId?: string | null;
}

/**
 * Hook to track match and tournament-level events
 * These are separate from game events (card plays, attacks, etc.)
 * and provide context about players, matches, and tournament flow
 */
export function useMatchEvents(options: UseMatchEventsOptions = {}) {
  const [events, setEvents] = useState<MatchEvent[]>([]);

  const addEvent = useCallback((
    type: MatchEvent['type'],
    message: string,
    metadata?: MatchEvent['metadata']
  ) => {
    const event: MatchEvent = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      message,
      metadata
    };

    setEvents(prev => [...prev, event]);
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    addEvent,
    clearEvents
  };
}

/**
 * Format a match event for display
 */
export function formatMatchEvent(event: MatchEvent): { text: string; icon: string; color?: string } {
  switch (event.type) {
    case 'player_joined':
      return {
        text: event.message,
        icon: '✅',
        color: 'text-green-400'
      };
    case 'player_left':
      return {
        text: event.message,
        icon: '👋',
        color: 'text-slate-400'
      };
    case 'player_disconnected':
      return {
        text: event.message,
        icon: '⚠️',
        color: 'text-yellow-400'
      };
    case 'player_reconnected':
      return {
        text: event.message,
        icon: '🔄',
        color: 'text-blue-400'
      };
    case 'match_started':
      return {
        text: event.message,
        icon: '🎮',
        color: 'text-cyan-400'
      };
    case 'match_ended':
      return {
        text: event.message,
        icon: event.metadata?.isDraw ? '🤝' : '🏆',
        color: event.metadata?.isDraw ? 'text-slate-300' : 'text-amber-400'
      };
    case 'game_started':
      return {
        text: event.message,
        icon: '▶️',
        color: 'text-blue-400'
      };
    case 'game_ended':
      return {
        text: event.message,
        icon: '⏸️',
        color: 'text-slate-400'
      };
    case 'round_started':
      return {
        text: event.message,
        icon: '🔔',
        color: 'text-purple-400'
      };
    case 'pairings_announced':
      return {
        text: event.message,
        icon: '📋',
        color: 'text-indigo-400'
      };
    case 'tournament_started':
      return {
        text: event.message,
        icon: '🏁',
        color: 'text-green-400'
      };
    case 'player_eliminated':
      return {
        text: event.message,
        icon: '❌',
        color: 'text-red-400'
      };
    default:
      return {
        text: event.message,
        icon: '•',
        color: undefined
      };
  }
}
