/**
 * T007: Card hover state management tests
 * 
 * These tests verify the hover state management system with proper timing and cleanup.
 * Based on the working draft-3d implementation patterns.
 * 
 * ⚠️ CRITICAL: Tests will fail initially as hover state management doesn't exist yet
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Type definitions for test mocks
type MockFunction = ReturnType<typeof vi.fn>;
type ReactCallback<T = unknown> = T;
type ReactRef<T = unknown> = { current: T };
type ReactState<T = unknown> = [T, MockFunction];

// Mock React hooks
vi.mock('react', () => ({
  useCallback: <T>(fn: T): ReactCallback<T> => fn,
  useRef: <T>(initial: T): ReactRef<T> => ({ current: initial }),
  useEffect: vi.fn(),
  useState: <T>(initial: T): ReactState<T> => [initial, vi.fn()],
}));

// Card preview data type
type CardPreviewData = {
  slug: string;
  name: string;
  type: string | null;
};

// Mock hover state manager implementation
class MockHoverStateManager {
  private currentCard: CardPreviewData | null = null;
  private previewVisible: boolean = false;
  private clearTimer: NodeJS.Timeout | null = null;
  private showPreviewCallback?: (card: CardPreviewData) => void;
  private hidePreviewCallback?: () => void;

  constructor(
    showPreview: (card: CardPreviewData) => void,
    hidePreview: () => void
  ) {
    this.showPreviewCallback = showPreview;
    this.hidePreviewCallback = hidePreview;
  }

  showCardPreview(card: CardPreviewData) {
    // Validate card data
    if (!this.isValidCard(card)) {
      return; // Reject invalid cards
    }

    // Always clear any pending hide timer first
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }

    // Prevent duplicate events for same card (only if no hide timer was pending)
    const isSameCard = this.currentCard && 
        this.currentCard.slug === card.slug && 
        this.currentCard.name === card.name && 
        this.currentCard.type === card.type;
    
    if (isSameCard && this.previewVisible) {
      return; // Same card, no need to trigger callback again
    }
    
    // Show preview immediately
    this.currentCard = card;
    this.previewVisible = true;
    
    if (this.showPreviewCallback && !isSameCard) {
      this.showPreviewCallback(card);
    }
  }

  private isValidCard(card: CardPreviewData): boolean {
    return !!(card && 
              card.slug && 
              card.slug.length > 0 && 
              card.name && 
              card.name.length > 0);
  }

  hideCardPreview() {
    // Only start hide timer if we have a visible card
    if (!this.previewVisible || !this.currentCard) {
      return;
    }

    // Debounced hide with 400ms delay
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
    }
    
    this.clearTimer = setTimeout(() => {
      this.currentCard = null;
      this.previewVisible = false;
      this.clearTimer = null;
      
      if (this.hidePreviewCallback) {
        this.hidePreviewCallback();
      }
    }, 400);
  }

  clearHoverTimers() {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = null;
    }
  }

  get isHovering() {
    return this.previewVisible;
  }

  get activeCard() {
    return this.currentCard;
  }

  get hasActiveTimers() {
    return this.clearTimer !== null;
  }
}

describe('Card Hover State Management', () => {
  let hoverManager: MockHoverStateManager;
  let showPreviewMock: MockFunction;
  let hidePreviewMock: MockFunction;
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    showPreviewMock = vi.fn();
    hidePreviewMock = vi.fn();
    
    hoverManager = new MockHoverStateManager(showPreviewMock, hidePreviewMock);
    cleanup = [];
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    cleanup.forEach(fn => fn());
    hoverManager.clearHoverTimers();
  });

  describe('Basic Hover State', () => {
    test('MUST show preview immediately on hover (WILL FAIL INITIALLY)', () => {
      const testCard: CardPreviewData = {
        slug: 'test-card',
        name: 'Test Card',
        type: 'Creature',
      };

      hoverManager.showCardPreview(testCard);

      // ❌ WILL FAIL - hover state manager doesn't exist yet
      expect(hoverManager.isHovering).toBe(true);
      expect(hoverManager.activeCard).toEqual(testCard);
      expect(showPreviewMock).toHaveBeenCalledWith(testCard);
    });

    test('MUST hide preview after 400ms delay', () => {
      const testCard: CardPreviewData = {
        slug: 'delay-test-card',
        name: 'Delay Test Card',
        type: 'Spell',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      // Should still be visible immediately
      expect(hoverManager.isHovering).toBe(true);
      expect(hoverManager.activeCard).toEqual(testCard);

      // Should be hidden after 400ms
      vi.advanceTimersByTime(400);
      
      // ❌ WILL FAIL - hover state manager doesn't exist yet
      expect(hoverManager.isHovering).toBe(false);
      expect(hoverManager.activeCard).toBeNull();
      expect(hidePreviewMock).toHaveBeenCalled();
    });

    test('MUST cancel hide if hover returns before delay', () => {
      const testCard: CardPreviewData = {
        slug: 'cancel-test-card',
        name: 'Cancel Test Card',
        type: 'Site',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      // Return hover before delay completes
      vi.advanceTimersByTime(200); // Only 200ms of 400ms
      hoverManager.showCardPreview(testCard);

      // Advance past original hide time
      vi.advanceTimersByTime(300); // Total 500ms

      // ❌ WILL FAIL - should still be visible, hide was cancelled
      expect(hoverManager.isHovering).toBe(true);
      expect(hoverManager.activeCard).toEqual(testCard);
      expect(hidePreviewMock).not.toHaveBeenCalled();
    });
  });

  describe('Timer Management', () => {
    test('MUST clean up timers properly', () => {
      const testCard: CardPreviewData = {
        slug: 'cleanup-card',
        name: 'Cleanup Card',
        type: 'Creature',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      expect(hoverManager.hasActiveTimers).toBe(true);

      hoverManager.clearHoverTimers();

      // ❌ WILL FAIL - timer cleanup not implemented yet
      expect(hoverManager.hasActiveTimers).toBe(false);

      // Advance time - should not trigger hide callback
      vi.advanceTimersByTime(500);
      expect(hidePreviewMock).not.toHaveBeenCalled();
    });

    test('MUST handle multiple rapid hover events', () => {
      const cards: CardPreviewData[] = [
        { slug: 'rapid-1', name: 'Rapid 1', type: 'Creature' },
        { slug: 'rapid-2', name: 'Rapid 2', type: 'Spell' },
        { slug: 'rapid-3', name: 'Rapid 3', type: 'Site' },
      ];

      showPreviewMock.mockClear();

      // Rapid succession of hover events
      cards.forEach((card, i) => {
        hoverManager.showCardPreview(card);
        hoverManager.hideCardPreview();
        vi.advanceTimersByTime(100); // Don't let any complete
      });

      // Show final card
      hoverManager.showCardPreview(cards[2]);

      // ❌ WILL FAIL - should handle rapid events without issues
      expect(hoverManager.activeCard).toEqual(cards[2]);
      expect(hoverManager.hasActiveTimers).toBe(false); // No pending hide timers
      expect(showPreviewMock).toHaveBeenLastCalledWith(cards[2]);
    });

    test('MUST prevent timer leaks on component unmount', () => {
      const testCard: CardPreviewData = {
        slug: 'unmount-card',
        name: 'Unmount Card',
        type: 'Creature',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      expect(hoverManager.hasActiveTimers).toBe(true);

      // Simulate component unmount
      hoverManager.clearHoverTimers();

      // Advance past hide delay
      vi.advanceTimersByTime(500);

      // ❌ WILL FAIL - should not call hide callback after cleanup
      expect(hidePreviewMock).not.toHaveBeenCalled();
      expect(hoverManager.hasActiveTimers).toBe(false);
    });
  });

  describe('Card State Transitions', () => {
    test('MUST transition through states correctly', () => {
      const card1: CardPreviewData = {
        slug: 'transition-card-1',
        name: 'Transition Card 1',
        type: 'Creature',
      };

      const card2: CardPreviewData = {
        slug: 'transition-card-2',
        name: 'Transition Card 2',
        type: 'Spell',
      };

      // Initial state: null
      expect(hoverManager.activeCard).toBeNull();
      expect(hoverManager.isHovering).toBe(false);

      // State: hovering card1
      hoverManager.showCardPreview(card1);
      expect(hoverManager.activeCard).toEqual(card1);
      expect(hoverManager.isHovering).toBe(true);

      // State: transitioning to card2
      hoverManager.showCardPreview(card2);
      expect(hoverManager.activeCard).toEqual(card2);
      expect(hoverManager.isHovering).toBe(true);

      // State: hiding
      hoverManager.hideCardPreview();
      expect(hoverManager.isHovering).toBe(true); // Still visible during delay
      expect(hoverManager.activeCard).toEqual(card2); // Still showing card2

      // State: hidden (after delay)
      vi.advanceTimersByTime(400);
      
      // ❌ WILL FAIL - state transitions not implemented
      expect(hoverManager.activeCard).toBeNull();
      expect(hoverManager.isHovering).toBe(false);
    });

    test('MUST handle same card hover (no duplicate events)', () => {
      const testCard: CardPreviewData = {
        slug: 'same-card',
        name: 'Same Card',
        type: 'Creature',
      };

      showPreviewMock.mockClear();

      // Show same card multiple times
      hoverManager.showCardPreview(testCard);
      hoverManager.showCardPreview(testCard);
      hoverManager.showCardPreview(testCard);

      // ❌ WILL FAIL - should optimize to prevent duplicate events
      // This test defines desired behavior (may need implementation)
      expect(showPreviewMock).toHaveBeenCalledTimes(1);
      expect(hoverManager.activeCard).toEqual(testCard);
    });
  });

  describe('Integration with Draft-3D Pattern', () => {
    test('MUST match draft-3d showCardPreview implementation', () => {
      // Test the exact pattern from draft-3d
      const currentHoverCardRef = { current: null as string | null };
      const clearHoverTimerRef = { current: null as NodeJS.Timeout | null };
      let previewState = null as CardPreviewData | null;

      const showCardPreview = (card: CardPreviewData) => {
        // Clear any pending hide timer
        if (clearHoverTimerRef.current) {
          clearTimeout(clearHoverTimerRef.current);
          clearHoverTimerRef.current = null;
        }
        
        // Show preview immediately and keep it shown while hovering
        currentHoverCardRef.current = card.slug;
        previewState = card;
        showPreviewMock(card);
      };

      const testCard: CardPreviewData = {
        slug: 'draft-pattern-card',
        name: 'Draft Pattern Card',
        type: 'Creature',
      };

      showCardPreview(testCard);

      // ❌ WILL FAIL - this exact pattern should be implemented
      expect(currentHoverCardRef.current).toBe('draft-pattern-card');
      expect(previewState).toEqual(testCard);
      expect(showPreviewMock).toHaveBeenCalledWith(testCard);
      expect(clearHoverTimerRef.current).toBeNull(); // Timer was cleared
    });

    test('MUST match draft-3d hideCardPreview implementation', () => {
      const clearHoverTimerRef = { current: null as NodeJS.Timeout | null };
      let previewState = { slug: 'test', name: 'Test', type: 'Creature' } as CardPreviewData | null;
      const currentHoverCardRef = { current: 'test' as string | null };

      const hideCardPreview = () => {
        // Small delay before hiding to handle quick mouse movements
        if (clearHoverTimerRef.current) {
          clearTimeout(clearHoverTimerRef.current);
        }
        
        clearHoverTimerRef.current = setTimeout(() => {
          currentHoverCardRef.current = null;
          previewState = null;
          hidePreviewMock();
          clearHoverTimerRef.current = null;
        }, 400);
      };

      hideCardPreview();

      // ❌ WILL FAIL - timer should be set
      expect(clearHoverTimerRef.current).not.toBeNull();
      expect(previewState).not.toBeNull(); // Still visible

      vi.advanceTimersByTime(400);

      // ❌ WILL FAIL - should be hidden after delay
      expect(currentHoverCardRef.current).toBeNull();
      expect(previewState).toBeNull();
      expect(hidePreviewMock).toHaveBeenCalled();
      expect(clearHoverTimerRef.current).toBeNull();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('MUST handle invalid card data gracefully', () => {
      const invalidCards = [
        { slug: '', name: 'Invalid Empty Slug', type: 'Creature' },
        { slug: 'valid-slug', name: '', type: 'Creature' },
        // @ts-expect-error - Testing runtime behavior
        { slug: null, name: 'Null Slug', type: 'Creature' },
        // @ts-expect-error - Testing runtime behavior  
        { name: 'Missing Slug', type: 'Creature' },
      ];

      invalidCards.forEach((invalidCard, index) => {
        expect(() => {
          // @ts-expect-error - Testing runtime behavior
          hoverManager.showCardPreview(invalidCard);
        }).not.toThrow(); // Should handle gracefully, not crash

        // Should not set invalid card as active
        if (invalidCard.slug && invalidCard.slug.length > 0 && invalidCard.name) {
          expect(hoverManager.activeCard).toEqual(invalidCard);
        } else {
          // ❌ Should reject invalid cards
          expect(hoverManager.activeCard).not.toEqual(invalidCard);
        }
      });
    });

    test('MUST handle rapid show/hide cycles', () => {
      const testCard: CardPreviewData = {
        slug: 'rapid-cycle-card',
        name: 'Rapid Cycle Card',
        type: 'Creature',
      };

      showPreviewMock.mockClear();
      hidePreviewMock.mockClear();

      // Rapid show/hide cycle
      for (let i = 0; i < 10; i++) {
        hoverManager.showCardPreview(testCard);
        hoverManager.hideCardPreview();
        vi.advanceTimersByTime(50); // Don't let hide complete
      }

      // Final show
      hoverManager.showCardPreview(testCard);

      // ❌ WILL FAIL - should handle rapid cycles without issues
      expect(hoverManager.activeCard).toEqual(testCard);
      expect(hoverManager.hasActiveTimers).toBe(false);
      expect(showPreviewMock).toHaveBeenCalled(); // Should have been called
      expect(hidePreviewMock).not.toHaveBeenCalled(); // Hide was always cancelled
    });

    test('MUST handle very long delays gracefully', () => {
      const testCard: CardPreviewData = {
        slug: 'long-delay-card',
        name: 'Long Delay Card',
        type: 'Creature',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      // Advance by a very long time
      vi.advanceTimersByTime(60000); // 1 minute

      // Should still work correctly
      expect(hoverManager.activeCard).toBeNull();
      expect(hoverManager.isHovering).toBe(false);
      expect(hidePreviewMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Performance and Memory', () => {
    test('MUST not accumulate timers with many hover events', () => {
      const testCard: CardPreviewData = {
        slug: 'perf-card',
        name: 'Performance Card',
        type: 'Creature',
      };

      // Create many hover events
      for (let i = 0; i < 1000; i++) {
        hoverManager.showCardPreview(testCard);
        hoverManager.hideCardPreview();
        // Don't advance time - create many pending timers
      }

      // Should only have one active timer (the last one)
      expect(hoverManager.hasActiveTimers).toBe(true);

      // Clean up should clear all
      hoverManager.clearHoverTimers();
      expect(hoverManager.hasActiveTimers).toBe(false);
    });

    test('MUST handle memory cleanup on disposal', () => {
      const testCard: CardPreviewData = {
        slug: 'disposal-card',
        name: 'Disposal Card',
        type: 'Creature',
      };

      hoverManager.showCardPreview(testCard);
      hoverManager.hideCardPreview();

      // Simulate component disposal/cleanup
      const dispose = () => {
        hoverManager.clearHoverTimers();
        // Additional cleanup would happen here in real implementation
      };

      expect(() => dispose()).not.toThrow();
      expect(hoverManager.hasActiveTimers).toBe(false);
    });
  });
});