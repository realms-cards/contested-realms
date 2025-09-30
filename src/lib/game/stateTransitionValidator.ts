import type { PermanentPositionState } from '@/lib/game/types';

export type ExtendedPermanentPositionState = PermanentPositionState | 'flying';

export interface PermanentStateTransitionContext {
  state: ExtendedPermanentPositionState;
  abilities: {
    canBurrow: boolean;
    canSubmerge: boolean;
    canFly: boolean;
    requiresWaterSite: boolean;
  };
  conditions: {
    atWaterSite: boolean;
    hasMovementLeft: boolean;
    isTapped: boolean;
  };
}

export interface TransitionValidationResult {
  isValid: boolean;
  reason?: string;
}

const DIRECT_TRANSITION_DENIAL: Record<
  ExtendedPermanentPositionState,
  Partial<Record<ExtendedPermanentPositionState, string>>
> = {
  surface: {},
  burrowed: {
    submerged: 'Cannot transition directly from burrowed to submerged',
    flying: 'Cannot transition directly from burrowed to flying',
  },
  submerged: {
    burrowed: 'Cannot transition directly from submerged to burrowed',
    flying: 'Cannot transition directly from submerged to flying',
  },
  flying: {
    burrowed: 'Cannot transition directly from flying to burrowed',
    submerged: 'Cannot transition directly from flying to submerged',
  },
};

export function validatePermanentStateTransition(
  context: PermanentStateTransitionContext,
  targetState: ExtendedPermanentPositionState
): TransitionValidationResult {
  if (targetState === context.state) {
    return { isValid: false, reason: 'Already in that state' };
  }

  const denialReason = DIRECT_TRANSITION_DENIAL[context.state]?.[targetState];
  if (denialReason) {
    return { isValid: false, reason: denialReason };
  }

  switch (context.state) {
    case 'surface':
      return validateFromSurface(context, targetState);
    case 'burrowed':
      return validateFromBurrowed(context, targetState);
    case 'submerged':
      return validateFromSubmerged(context, targetState);
    case 'flying':
      return validateFromFlying(targetState);
    default:
      return { isValid: false, reason: 'Unknown current state' };
  }
}

function validateFromSurface(
  context: PermanentStateTransitionContext,
  target: ExtendedPermanentPositionState
): TransitionValidationResult {
  if (target === 'burrowed') {
    if (!context.abilities.canBurrow) {
      return { isValid: false, reason: 'Cannot burrow' };
    }
    if (!context.conditions.hasMovementLeft) {
      return { isValid: false, reason: 'No movement left' };
    }
    return { isValid: true };
  }

  if (target === 'submerged') {
    if (!context.abilities.canSubmerge) {
      return { isValid: false, reason: 'Cannot submerge' };
    }
    if (context.abilities.requiresWaterSite && !context.conditions.atWaterSite) {
      return { isValid: false, reason: 'Requires water site' };
    }
    if (!context.conditions.hasMovementLeft) {
      return { isValid: false, reason: 'No movement left' };
    }
    return { isValid: true };
  }

  if (target === 'flying') {
    if (!context.abilities.canFly) {
      return { isValid: false, reason: 'Cannot fly' };
    }
    if (!context.conditions.hasMovementLeft) {
      return { isValid: false, reason: 'No movement left' };
    }
    if (context.conditions.isTapped) {
      return { isValid: false, reason: 'Cannot fly while tapped' };
    }
    return { isValid: true };
  }

  return { isValid: false, reason: `No transition rule from ${context.state} to ${target}` };
}

function validateFromBurrowed(
  context: PermanentStateTransitionContext,
  target: ExtendedPermanentPositionState
): TransitionValidationResult {
  if (target === 'surface') {
    if (!context.conditions.hasMovementLeft) {
      return { isValid: false, reason: 'No movement left' };
    }
    return { isValid: true };
  }
  return { isValid: false, reason: `No transition rule from burrowed to ${target}` };
}

function validateFromSubmerged(
  context: PermanentStateTransitionContext,
  target: ExtendedPermanentPositionState
): TransitionValidationResult {
  if (target === 'surface') {
    if (!context.conditions.hasMovementLeft) {
      return { isValid: false, reason: 'No movement left' };
    }
    return { isValid: true };
  }
  return { isValid: false, reason: `No transition rule from submerged to ${target}` };
}

function validateFromFlying(target: ExtendedPermanentPositionState): TransitionValidationResult {
  if (target === 'surface') {
    return { isValid: true };
  }
  return { isValid: false, reason: `No transition rule from flying to ${target}` };
}

export function getAvailablePermanentTransitions(
  context: PermanentStateTransitionContext
): Array<{ state: ExtendedPermanentPositionState; validation: TransitionValidationResult }> {
  const states: ExtendedPermanentPositionState[] = ['surface', 'burrowed', 'submerged', 'flying'];
  return states
    .filter((state) => state !== context.state)
    .map((state) => ({
      state,
      validation: validatePermanentStateTransition(context, state),
    }));
}
