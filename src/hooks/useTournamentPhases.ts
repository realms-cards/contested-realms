import { useState, useCallback, useEffect } from 'react';

type TournamentStatus = 'registering' | 'preparing' | 'active' | 'completed' | 'cancelled';

interface PhaseTransition {
  from: TournamentStatus;
  to: TournamentStatus;
  action: string;
  requiredConditions?: string[];
}

interface TournamentPhase {
  status: TournamentStatus;
  canTransitionTo: TournamentStatus[];
  availableActions: string[];
  phase: {
    name: string;
    description: string;
    duration?: number;
    autoTransition?: boolean;
  };
}

const PHASE_TRANSITIONS: PhaseTransition[] = [
  {
    from: 'registering',
    to: 'preparing',
    action: 'start',
    requiredConditions: ['minimum_players', 'all_players_ready']
  },
  {
    from: 'preparing',
    to: 'active',
    action: 'auto_transition',
    requiredConditions: ['all_players_prepared']
  },
  {
    from: 'active',
    to: 'completed',
    action: 'finish',
    requiredConditions: ['tournament_finished']
  },
  {
    from: 'registering',
    to: 'cancelled',
    action: 'cancel',
    requiredConditions: []
  },
  {
    from: 'preparing',
    to: 'cancelled',
    action: 'cancel',
    requiredConditions: []
  },
  {
    from: 'active',
    to: 'cancelled',
    action: 'cancel',
    requiredConditions: []
  }
];

const PHASE_DEFINITIONS: Record<TournamentStatus, TournamentPhase['phase']> = {
  registering: {
    name: 'Registration Phase',
    description: 'Players are joining the tournament and setting their ready status',
    autoTransition: false
  },
  preparing: {
    name: 'Preparation Phase',
    description: 'Players are preparing for the tournament (opening packs, drafting, selecting decks)',
    duration: 30 * 60 * 1000, // 30 minutes
    autoTransition: true
  },
  active: {
    name: 'Active Tournament',
    description: 'Tournament is in progress with active matches',
    autoTransition: false
  },
  completed: {
    name: 'Tournament Complete',
    description: 'Tournament has finished, final standings available',
    autoTransition: false
  },
  cancelled: {
    name: 'Tournament Cancelled',
    description: 'Tournament was cancelled and is no longer active',
    autoTransition: false
  }
};

interface PhaseState {
  currentPhase: TournamentPhase;
  timeInPhase: number;
  timeRemaining?: number;
  conditions: Record<string, boolean>;
  canPerformActions: string[];
  loading: boolean;
  error: string | null;
}

export function useTournamentPhases(
  tournamentId: string | null,
  initialStatus?: TournamentStatus,
  options?: { isConnected?: boolean; pollIntervalMs?: number }
) {
  const status = initialStatus || 'registering';
  const [state, setState] = useState<PhaseState>(() => {
    const phase = PHASE_DEFINITIONS[status];
    const transitions = PHASE_TRANSITIONS.filter(t => t.from === status);
    
    return {
      currentPhase: {
        status,
        canTransitionTo: transitions.map(t => t.to),
        availableActions: transitions.map(t => t.action),
        phase
      },
      timeInPhase: 0,
      conditions: {},
      canPerformActions: [],
      loading: false,
      error: null
    };
  });

  // Update phase when tournament status changes
  const updatePhase = useCallback((newStatus: TournamentStatus) => {
    const phase = PHASE_DEFINITIONS[newStatus];
    const transitions = PHASE_TRANSITIONS.filter(t => t.from === newStatus);
    
    setState(prev => ({
      ...prev,
      currentPhase: {
        status: newStatus,
        canTransitionTo: transitions.map(t => t.to),
        availableActions: transitions.map(t => t.action),
        phase
      },
      timeInPhase: 0,
      timeRemaining: phase.duration
    }));
  }, []);

  // Check conditions for phase transitions
  const checkConditions = useCallback(async () => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return;
    }
    
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      // This would typically fetch from multiple endpoints to determine conditions
      const [
        tournamentResponse,
        standingsResponse,
        preparationResponse
      ] = await Promise.allSettled([
        fetch(`/api/tournaments/${tournamentId}`),
        fetch(`/api/tournaments/${tournamentId}/standings`),
        fetch(`/api/tournaments/${tournamentId}/preparation/status`)
      ]);

      const conditions: Record<string, boolean> = {};

      // Check tournament-level conditions
      if (tournamentResponse.status === 'fulfilled' && tournamentResponse.value.ok) {
        const tournament = await tournamentResponse.value.json();
        conditions.minimum_players = tournament.currentPlayers >= 2;
        conditions.tournament_finished = tournament.status === 'completed';
      }

      // Check standings conditions
      if (standingsResponse.status === 'fulfilled' && standingsResponse.value.ok) {
        const standings = await standingsResponse.value.json();
        conditions.all_players_ready = standings.standings.every((s: { isReady?: boolean }) => s.isReady);
      }

      // Check preparation conditions
      if (preparationResponse.status === 'fulfilled' && preparationResponse.value.ok) {
        const preparation = await preparationResponse.value.json();
        conditions.all_players_prepared = preparation.allPlayersComplete;
      }

      // Determine which actions can be performed
      const canPerformActions: string[] = [];
      const currentStatus = state.currentPhase.status;
      
      for (const transition of PHASE_TRANSITIONS) {
        if (transition.from === currentStatus) {
          const canTransition = !transition.requiredConditions || 
            transition.requiredConditions.every(cond => conditions[cond]);
          
          if (canTransition) {
            canPerformActions.push(transition.action);
          }
        }
      }

      setState(prev => ({
        ...prev,
        conditions,
        canPerformActions,
        loading: false
      }));

      // Auto-transition disabled - transitions should only happen via explicit user actions
      // The backend API should handle all tournament state transitions
      // Frontend phase management is only for UI display purposes

    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to check conditions',
        loading: false
      }));
    }
  }, [tournamentId, state.currentPhase.status]);

  // Perform phase transition action
  const performAction = useCallback(async (action: string): Promise<Response | undefined> => {
    // Skip API calls if no tournament ID
    if (!tournamentId) {
      return undefined;
    }
    
    if (!state.canPerformActions.includes(action)) {
      throw new Error(`Action "${action}" is not available in current phase`);
    }

    const transition = PHASE_TRANSITIONS.find(t => 
      t.from === state.currentPhase.status && t.action === action
    );

    if (!transition) {
      throw new Error(`No transition found for action "${action}"`);
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      // Perform the appropriate API call based on the action
      let response: Response;
      
      switch (action) {
        case 'start':
          response = await fetch(`/api/tournaments/${tournamentId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          break;
        case 'finish':
          response = await fetch(`/api/tournaments/${tournamentId}/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          break;
        case 'cancel':
          response = await fetch(`/api/tournaments/${tournamentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          });
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to perform action: ${action}`);
      }

      // Update phase to the target status
      updatePhase(transition.to);
      return response;

    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : `Failed to perform action: ${action}`,
        loading: false
      }));
      throw err;
    }
  }, [tournamentId, state.currentPhase.status, state.canPerformActions, updatePhase]);

  // Timer for tracking time in phase and countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        const newTimeInPhase = prev.timeInPhase + 1000;
        const phaseDuration = prev.currentPhase?.phase?.duration;
        const newTimeRemaining = phaseDuration 
          ? Math.max(0, phaseDuration - newTimeInPhase)
          : undefined;

        return {
          ...prev,
          timeInPhase: newTimeInPhase,
          timeRemaining: newTimeRemaining
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Periodic condition checking (backup): avoid polling when socket is connected or tab hidden
  useEffect(() => {
    if (!tournamentId) return undefined;
    if (options?.isConnected) {
      return undefined;
    }
    checkConditions();
    const pollMs = options?.pollIntervalMs ?? 20000;
    let id: number | null = null;
    const start = () => {
      if (options?.isConnected) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (id != null) return;
      id = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        void checkConditions();
      }, pollMs);
    };
    const stop = () => { if (id != null) { clearInterval(id); id = null; } };
    start();
    const onVis = () => { stop(); start(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    return () => { stop(); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis); };
  }, [checkConditions, tournamentId, options?.isConnected, options?.pollIntervalMs]);

  return {
    ...state,
    actions: {
      updatePhase,
      checkConditions,
      performAction
    }
  };
}
