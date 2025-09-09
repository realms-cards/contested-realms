// Bidirectional stack hover navigation system
// Reusable across draft-3d and online draft-3d components

import type { BoosterCard, Pick3D, StackPosition } from "./cardSorting";

export interface StackHoverState {
  currentStackId: string | null;
  currentCardId: number | null;
  lastMouseY: number;
  direction: 'up' | 'down' | null;
}

export interface StackHoverConfig {
  picks: Pick3D[];
  stackPositions: Map<number, StackPosition> | null;
  hoverState: StackHoverState;
  showPreview: (card: { slug: string; name: string; type: string | null }) => void;
}

/**
 * Smart bidirectional stack hover navigation
 * Handles both top-to-bottom and bottom-to-top navigation through card stacks
 */
export function handleStackHover(
  cardId: number,
  card: BoosterCard,
  stackPos: StackPosition,
  mouseY: number,
  config: StackHoverConfig
): void {
  const { picks, stackPositions, hoverState, showPreview } = config;
  const stackId = `${stackPos.x}-${stackPos.z}`;
  
  // Get all cards in this stack, sorted by stack index (bottom to top)
  const cardsInStack = picks
    .filter(p => {
      const pos = stackPositions?.get(p.id);
      return pos && `${pos.x}-${pos.z}` === stackId;
    })
    .sort((a, b) => {
      const posA = stackPositions?.get(a.id);
      const posB = stackPositions?.get(b.id);
      return (posA?.stackIndex || 0) - (posB?.stackIndex || 0);
    });
  
  if (cardsInStack.length <= 1) {
    // Single card, just show it
    hoverState.currentStackId = stackId;
    hoverState.currentCardId = cardId;
    showPreview({
      slug: card.slug,
      name: card.cardName,
      type: card.type,
    });
    return;
  }
  
  // Track mouse movement direction with threshold to prevent jitter
  const currentMouseY = mouseY;
  const mouseDelta = currentMouseY - hoverState.lastMouseY;
  const absMouseDelta = Math.abs(mouseDelta);
  
  // If entering a new stack, always show the card that triggered the hover
  if (hoverState.currentStackId !== stackId) {
    hoverState.currentStackId = stackId;
    hoverState.currentCardId = cardId;
    hoverState.lastMouseY = currentMouseY;
    hoverState.direction = null; // Reset direction for new stack
    
    showPreview({
      slug: card.slug,
      name: card.cardName,
      type: card.type,
    });
    return;
  }
  
  // Only process movement if mouse moved significantly (more than 3 pixels)
  if (absMouseDelta < 3) {
    return; // Too small movement, ignore to prevent jitter
  }
  
  // Update mouse position and direction
  const direction = mouseDelta < 0 ? 'up' : 'down';
  hoverState.lastMouseY = currentMouseY;
  hoverState.direction = direction;
  
  // Find current card position in stack
  const currentIndex = cardsInStack.findIndex(p => p.id === hoverState.currentCardId);
  if (currentIndex === -1) {
    // Current card not found, show the hovered card
    hoverState.currentCardId = cardId;
    showPreview({
      slug: card.slug,
      name: card.cardName,
      type: card.type,
    });
    return;
  }
  
  // Important: For top-to-bottom navigation, we need to handle the fact that
  // the raycast always hits the topmost card first. So when moving down,
  // we should advance through the stack regardless of which card triggered the event.
  
  // Special handling: If we're in a stack and a card from the same stack triggers hover,
  // we determine which card to show based on movement direction, not the triggering card
  let targetIndex = currentIndex;
  
  // Find the triggering card's position in the stack
  const triggeringIndex = cardsInStack.findIndex(p => p.id === cardId);
  
  if (direction === 'down') {
    // Moving mouse down - advance to next higher card if available
    // Use the maximum of current index + 1 or the triggering card index
    // This ensures we can navigate down even when raycast hits the top card
    if (triggeringIndex >= 0 && triggeringIndex > currentIndex) {
      // If the triggering card is below current, jump to it
      targetIndex = triggeringIndex;
    } else if (currentIndex < cardsInStack.length - 1) {
      // Otherwise, just advance by one
      targetIndex = currentIndex + 1;
    }
  } else if (direction === 'up') {
    // Moving mouse up - go to previous lower card if available
    // Use the minimum of current index - 1 or the triggering card index
    if (triggeringIndex >= 0 && triggeringIndex < currentIndex) {
      // If the triggering card is above current, jump to it
      targetIndex = triggeringIndex;
    } else if (currentIndex > 0) {
      // Otherwise, just go back by one
      targetIndex = currentIndex - 1;
    }
  }
  
  // Update to the target card
  if (targetIndex !== currentIndex && targetIndex >= 0 && targetIndex < cardsInStack.length) {
    const targetCard = cardsInStack[targetIndex];
    hoverState.currentCardId = targetCard.id;
    showPreview({
      slug: targetCard.card.slug,
      name: targetCard.card.cardName,
      type: targetCard.card.type,
    });
  }
}

/**
 * Initialize stack hover state
 */
export function createStackHoverState(): StackHoverState {
  return {
    currentStackId: null,
    currentCardId: null,
    lastMouseY: 0,
    direction: null,
  };
}

/**
 * Reset stack hover state when leaving all stacks
 */
export function resetStackHover(hoverState: StackHoverState): void {
  hoverState.currentStackId = null;
  hoverState.currentCardId = null;
  hoverState.direction = null;
}