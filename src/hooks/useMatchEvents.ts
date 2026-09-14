import { useState, useCallback } from 'react';

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

/**
 * Hook to track match and tournament-level events
 * These are separate from game events (card plays, attacks, etc.)
 * and provide context about players, matches, and tournament flow
 */
export function useMatchEvents() {
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
 * Format a match event for display.
 * `icon` is an Iconify game-icons name; when absent the line renders a bullet.
 */
export function formatMatchEvent(event: MatchEvent): { text: string; icon?: string; color?: string } {
  switch (event.type) {
    case 'player_joined':
      return {
        text: event.message,
        icon: 'game-icons:entry-door',
        color: 'text-rc-success'
      };
    case 'player_left':
      return {
        text: event.message,
        icon: 'game-icons:exit-door',
        color: 'text-rc-fg-subtle'
      };
    case 'player_disconnected':
      return {
        text: event.message,
        icon: 'game-icons:unplugged',
        color: 'text-rc-warning'
      };
    case 'player_reconnected':
      return {
        text: event.message,
        icon: 'game-icons:plug',
        color: 'text-rc-info'
      };
    case 'match_started':
      return {
        text: event.message,
        icon: 'game-icons:crossed-swords',
        color: 'text-rc-ember'
      };
    case 'match_ended':
      return {
        text: event.message,
        icon: event.metadata?.isDraw ? 'game-icons:shaking-hands' : 'game-icons:laurels-trophy',
        color: event.metadata?.isDraw ? 'text-rc-fg-muted' : 'text-rc-accent-link'
      };
    case 'game_started':
      return {
        text: event.message,
        icon: 'game-icons:play-button',
        color: 'text-rc-info'
      };
    case 'game_ended':
      return {
        text: event.message,
        icon: 'game-icons:pause-button',
        color: 'text-rc-fg-subtle'
      };
    case 'round_started':
      return {
        text: event.message,
        icon: 'game-icons:ringing-bell',
        color: 'text-rc-moonlight'
      };
    case 'pairings_announced':
      return {
        text: event.message,
        icon: 'game-icons:scroll-unfurled',
        color: 'text-rc-fg-muted'
      };
    case 'tournament_started':
      return {
        text: event.message,
        icon: 'game-icons:checkered-flag',
        color: 'text-rc-success'
      };
    case 'player_eliminated':
      return {
        text: event.message,
        icon: 'game-icons:broken-skull',
        color: 'text-rc-danger'
      };
    default:
      return {
        text: event.message,
        icon: undefined,
        color: undefined
      };
  }
}
