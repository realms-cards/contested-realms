/**
 * useCardHover - Card hover state manager utility
 *
 * Implements the draft-3d hover pattern with proper timing and cleanup.
 * Provides stable hover state management with 400ms debounced hide.
 */

import { useCallback, useRef } from "react";
import type { CardPreviewData } from "@/lib/game/card-preview.types";

export type { CardPreviewData } from "@/lib/game/card-preview.types";

export type HoverStateCallbacks = {
  onShow: (card: CardPreviewData) => void;
  onHide: () => void;
};

/**
 * Hook for managing card hover state with proper timing and cleanup
 * Based on the working draft-3d implementation pattern
 */
export function useCardHover(callbacks: HoverStateCallbacks) {
  const { onShow, onHide } = callbacks;

  // Timer reference for debounced hide (400ms delay like draft-3d)
  const clearHoverTimerRef = useRef<number | null>(null);

  // Current hovered card slug for comparison
  const currentHoverCardRef = useRef<string | null>(null);

  /**
   * Show card preview immediately (draft-3d pattern)
   * Clears any pending hide timer
   */
  const showCardPreview = useCallback(
    (card: CardPreviewData) => {
      // Clear any pending hide timer - user is actively hovering
      if (clearHoverTimerRef.current) {
        window.clearTimeout(clearHoverTimerRef.current);
        clearHoverTimerRef.current = null;
      }

      // If we're already showing this slug, avoid redundant updates
      if (currentHoverCardRef.current === card.slug) {
        return;
      }

      // Show preview immediately and keep it shown while hovering
      currentHoverCardRef.current = card.slug;
      onShow(card);
    },
    [onShow]
  );

  /**
   * Hide card preview with 400ms delay (draft-3d pattern)
   * Handles quick mouse movements between cards gracefully
   */
  const hideCardPreview = useCallback(() => {
    // Small delay before hiding to handle quick mouse movements between cards
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
    }

    clearHoverTimerRef.current = window.setTimeout(() => {
      currentHoverCardRef.current = null;
      onHide();
      clearHoverTimerRef.current = null;
    }, 400); // 400ms delay matches draft-3d behavior
  }, [onHide]);

  /**
   * Hide card preview immediately without delay
   * Use for cases where we know the user has left the hover area
   */
  const hideCardPreviewImmediate = useCallback(() => {
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
      clearHoverTimerRef.current = null;
    }
    currentHoverCardRef.current = null;
    onHide();
  }, [onHide]);

  /**
   * Clean up any pending timers
   * Should be called on component unmount
   */
  const clearHoverTimers = useCallback(() => {
    if (clearHoverTimerRef.current) {
      window.clearTimeout(clearHoverTimerRef.current);
      clearHoverTimerRef.current = null;
    }
  }, []);

  /**
   * Get current hovered card slug
   * Useful for avoiding duplicate hover events
   */
  const getCurrentHoverCard = useCallback(() => {
    return currentHoverCardRef.current;
  }, []);

  /**
   * Check if there are active timers (for testing/debugging)
   */
  const hasActiveTimers = useCallback(() => {
    return clearHoverTimerRef.current !== null;
  }, []);

  return {
    showCardPreview,
    hideCardPreview,
    hideCardPreviewImmediate,
    clearHoverTimers,
    getCurrentHoverCard,
    hasActiveTimers,
  };
}
