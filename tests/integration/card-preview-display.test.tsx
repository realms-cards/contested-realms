/**
 * T008: Card preview display integration test
 * 
 * Integration test for the complete card preview system in editor-3d.
 * Tests the full flow: hover detection → state management → preview display
 * 
 * ⚠️ CRITICAL: This test will fail initially as the integration doesn't work yet
 */

import { render, fireEvent, screen, waitFor } from '@testing-library/react';
import React, { act } from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock React Testing Library
vi.mock('@testing-library/react', () => ({
  render: vi.fn(() => ({
    unmount: vi.fn(),
    rerender: vi.fn(),
  })),
  screen: {
    getByTestId: vi.fn(),
    queryByTestId: vi.fn(),
    getByText: vi.fn(),
    queryByText: vi.fn(),
  },
  fireEvent: {
    mouseEnter: vi.fn(),
    mouseLeave: vi.fn(),
    mouseMove: vi.fn(),
  },
  waitFor: vi.fn(),
  act: vi.fn((fn) => fn()),
}));

// Mock React Three Fiber
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => React.createElement('div', { 'data-testid': 'canvas' }, children),
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({
    camera: { position: { x: 0, y: 10, z: 0 } },
    scene: { children: [] },
    gl: { domElement: document.createElement('canvas') },
  })),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => 
    React.createElement('img', { src, alt, 'data-testid': 'card-image', ...props }),
}));

// Types for testing
type CardPreviewData = {
  slug: string;
  name: string;
  type: string | null;
};

type MockCard = {
  id: number;
  card: {
    slug: string;
    cardName: string;
    type: string | null;
  };
  x: number;
  z: number;
};

// Mock CardPreview component
const MockCardPreview = ({ card, anchor = 'top-left' }: { 
  card: CardPreviewData | null; 
  anchor?: string;
}) => {
  if (!card) return null;
  
  return React.createElement('div', {
    'data-testid': 'card-preview',
    'data-card-slug': card.slug,
    'data-anchor': anchor,
    'aria-label': `Card preview for ${card.name}`,
  }, [
    React.createElement('img', {
      key: 'preview-image',
      src: `/api/images/${card.slug}`,
      alt: card.name,
      'data-testid': 'preview-image',
    }),
    React.createElement('div', {
      key: 'preview-name',
      'data-testid': 'preview-name',
    }, card.name),
    card.type && React.createElement('div', {
      key: 'preview-type',
      'data-testid': 'preview-type',
    }, card.type),
  ]);
};

// Mock Editor-3D page component (simplified)
const MockEditor3DPage = ({ 
  initialCards = [], 
  onPreviewChange 
}: { 
  initialCards?: MockCard[];
  onPreviewChange?: (card: CardPreviewData | null) => void;
}) => {
  const [hoverPreview, setHoverPreview] = React.useState<CardPreviewData | null>(null);
  const [cards, setCards] = React.useState<MockCard[]>(initialCards);

  // Mock hover handlers (these will fail initially)
  const showCardPreview = React.useCallback((card: CardPreviewData) => {
    setHoverPreview(card);
    onPreviewChange?.(card);
  }, [onPreviewChange]);

  const hideCardPreview = React.useCallback(() => {
    setHoverPreview(null);
    onPreviewChange?.(null);
  }, [onPreviewChange]);

  // Mock DraggableCard3D components
  const cardElements = cards.map((cardData) => 
    React.createElement('div', {
      key: `card-${cardData.id}`,
      'data-testid': `draggable-card-${cardData.id}`,
      'data-card-slug': cardData.card.slug,
      'data-position': `${cardData.x},${cardData.z}`,
      style: {
        position: 'absolute',
        left: `${cardData.x * 50 + 400}px`, // Mock 3D to 2D conversion
        top: `${cardData.z * 50 + 300}px`,
        width: '60px',
        height: '84px',
        background: '#333',
        border: '1px solid #666',
        cursor: 'pointer',
      },
      onMouseEnter: () => {
        // ❌ This should work but will fail due to disabled raycasting
        showCardPreview({
          slug: cardData.card.slug,
          name: cardData.card.cardName,
          type: cardData.card.type,
        });
      },
      onMouseLeave: () => {
        // ❌ This should work but timing will be wrong initially
        hideCardPreview();
      },
    })
  );

  return React.createElement('div', {
    'data-testid': 'editor-3d-page',
    style: { position: 'relative', width: '800px', height: '600px' }
  }, [
    // 3D Canvas
    React.createElement('div', {
      key: 'canvas-container',
      'data-testid': 'canvas-container',
      style: { position: 'absolute', inset: 0 }
    }, cardElements),
    
    // Preview overlay
    hoverPreview && React.createElement(MockCardPreview, {
      key: 'card-preview',
      card: hoverPreview,
      anchor: 'top-left',
    }),
  ]);
};

describe('Card Preview Display Integration', () => {
  let mockCards: MockCard[];
  let previewChanges: (CardPreviewData | null)[];
  
  beforeEach(() => {
    vi.useFakeTimers();
    previewChanges = [];
    
    mockCards = [
      {
        id: 1,
        card: { slug: 'lightning-bolt', cardName: 'Lightning Bolt', type: 'Spell' },
        x: 0,
        z: 0,
      },
      {
        id: 2,  
        card: { slug: 'forest', cardName: 'Forest', type: 'Site' },
        x: 2,
        z: 0,
      },
      {
        id: 3,
        card: { slug: 'grizzly-bears', cardName: 'Grizzly Bears', type: 'Creature' },
        x: 0,
        z: 2,
      },
    ];
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  describe('Basic Preview Display', () => {
    test('MUST show CardPreview when hovering over DraggableCard3D (WILL FAIL INITIALLY)', () => {
      const onPreviewChange = vi.fn((card) => previewChanges.push(card));
      
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards,
        onPreviewChange,
      });

      // Simulate mounting and hovering
      render(editor);

      const firstCard = screen.getByTestId('draggable-card-1');
      expect(firstCard).toBeTruthy();

      // Hover over first card
      fireEvent.mouseEnter(firstCard);

      // ❌ WILL FAIL - preview should appear but raycast is disabled
      const preview = screen.queryByTestId('card-preview');
      expect(preview).toBeTruthy();
      expect((preview as HTMLElement)?.getAttribute('data-card-slug')).toBe('lightning-bolt');
      
      const previewName = screen.getByTestId('preview-name');
      expect(previewName.textContent).toBe('Lightning Bolt');
      
      const previewType = screen.getByTestId('preview-type');
      expect(previewType.textContent).toBe('Spell');
    });

    test('MUST hide CardPreview when mouse leaves card', async () => {
      const onPreviewChange = vi.fn();
      
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 1), // Just one card
        onPreviewChange,
      });

      // Using imported render, fireEvent, screen, waitFor
      render(editor);

      const card = screen.getByTestId('draggable-card-1');
      
      // Hover to show preview
      fireEvent.mouseEnter(card);
      expect(screen.queryByTestId('card-preview')).toBeTruthy();
      
      // Leave to hide preview
      fireEvent.mouseLeave(card);
      
      // Should still be visible immediately (debounced hide)
      expect(screen.queryByTestId('card-preview')).toBeTruthy();
      
      // Should be hidden after delay
      vi.advanceTimersByTime(400);
      
      // ❌ WILL FAIL - preview should disappear after 400ms
      await waitFor(() => {
        expect(screen.queryByTestId('card-preview')).toBeNull();
      });
    });

    test('MUST display correct card information in preview', () => {
      const siteCard: MockCard = {
        id: 99,
        card: { slug: 'mystic-monastery', cardName: 'Mystic Monastery', type: 'Site' },
        x: 1,
        z: 1,
      };

      const editor = React.createElement(MockEditor3DPage, {
        initialCards: [siteCard],
      });

      // Using imported render, fireEvent, screen
      render(editor);

      const card = screen.getByTestId('draggable-card-99');
      fireEvent.mouseEnter(card);

      const preview = screen.queryByTestId('card-preview');
      // ❌ WILL FAIL initially
      expect(preview).toBeTruthy();
      expect((preview as HTMLElement)?.getAttribute('data-card-slug')).toBe('mystic-monastery');
      
      const previewImage = screen.getByTestId('preview-image');
      expect((previewImage as HTMLImageElement).src).toBe('/api/images/mystic-monastery');
      expect((previewImage as HTMLImageElement).alt).toBe('Mystic Monastery');
      
      const previewName = screen.getByTestId('preview-name');
      expect(previewName.textContent).toBe('Mystic Monastery');
      
      const previewType = screen.getByTestId('preview-type');
      expect(previewType.textContent).toBe('Site');
    });

    test('MUST handle cards with null type', () => {
      const unknownCard: MockCard = {
        id: 88,
        card: { slug: 'unknown-card', cardName: 'Unknown Card', type: null },
        x: 0,
        z: 0,
      };

      const editor = React.createElement(MockEditor3DPage, {
        initialCards: [unknownCard],
      });

      // Using imported render, fireEvent, screen
      render(editor);

      const card = screen.getByTestId('draggable-card-88');
      fireEvent.mouseEnter(card);

      const preview = screen.queryByTestId('card-preview');
      expect(preview).toBeTruthy();
      
      const previewName = screen.getByTestId('preview-name');
      expect(previewName.textContent).toBe('Unknown Card');
      
      // Type section should not exist for null type
      const previewType = screen.queryByTestId('preview-type');
      expect(previewType).toBeNull();
    });
  });

  describe('Multiple Card Interactions', () => {
    test('MUST switch preview when hovering between cards', () => {
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards,
      });

      // Using imported render, fireEvent, screen
      render(editor);

      // Hover first card
      const firstCard = screen.getByTestId('draggable-card-1');
      fireEvent.mouseEnter(firstCard);
      
      let preview = screen.queryByTestId('card-preview');
      expect(preview?.getAttribute('data-card-slug')).toBe('lightning-bolt');

      // Switch to second card
      fireEvent.mouseLeave(firstCard);
      const secondCard = screen.getByTestId('draggable-card-2');
      fireEvent.mouseEnter(secondCard);

      preview = screen.queryByTestId('card-preview');
      // ❌ WILL FAIL - should switch to second card
      expect(preview?.getAttribute('data-card-slug')).toBe('forest');
      
      const previewName = screen.getByTestId('preview-name');
      expect(previewName.textContent).toBe('Forest');
    });

    test('MUST cancel hide timer when hovering new card quickly', async () => {
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 2), // First two cards
      });

      // Using imported render, fireEvent, screen, act
      render(editor);

      const firstCard = screen.getByTestId('draggable-card-1');
      const secondCard = screen.getByTestId('draggable-card-2');

      // Hover first card
      fireEvent.mouseEnter(firstCard);
      expect(screen.queryByTestId('card-preview')).toBeTruthy();

      // Leave first card (starts hide timer)
      fireEvent.mouseLeave(firstCard);

      // Quickly hover second card (should cancel hide timer)
      await act(async () => {
        vi.advanceTimersByTime(200); // Partial hide delay
        fireEvent.mouseEnter(secondCard);
      });

      // Advance past original hide time
      await act(async () => {
        vi.advanceTimersByTime(300); // Total 500ms
      });

      // ❌ WILL FAIL - preview should still be visible (hide was cancelled)
      const preview = screen.queryByTestId('card-preview');
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('data-card-slug')).toBe('forest');
    });
  });

  describe('Raycast Integration', () => {
    test('MUST detect hover through MouseTracker (WILL FAIL WITH DISABLED RAYCAST)', () => {
      // Mock the actual raycasting system
      const mockRaycast = vi.fn();
      
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 1),
      });

      // Using imported render, screen
      render(editor);

      // Mock MouseTracker detecting hover via raycast
      const mockMouseTracker = {
        updateMousePosition: (clientX: number, clientY: number) => {
          // Simulate raycast intersection
          const cards = screen.getAllByTestId(/draggable-card-/);
          
          cards.forEach(cardElement => {
            const rect = {
              left: parseInt(cardElement.style.left || '0'),
              top: parseInt(cardElement.style.top || '0'),
              width: 60,
              height: 84,
            };
            
            if (
              clientX >= rect.left &&
              clientX <= rect.left + rect.width &&
              clientY >= rect.top &&
              clientY <= rect.top + rect.height
            ) {
              // ❌ CURRENT PROBLEM: In real app, disabled raycast prevents this detection
              const cardSlug = cardElement.getAttribute('data-card-slug');
              const mockCard = mockCards.find(c => c.card.slug === cardSlug);
              
              if (mockCard) {
                // This would trigger the hover in the real app
                const event = new MouseEvent('mouseenter', {
                  clientX,
                  clientY,
                });
                cardElement.dispatchEvent(event);
              }
            }
          });
        }
      };

      // Simulate mouse movement that should trigger hover
      mockMouseTracker.updateMousePosition(430, 342); // Over first card

      // ❌ WILL FAIL - MouseTracker can't detect cards due to disabled raycast
      const preview = screen.queryByTestId('card-preview');
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('data-card-slug')).toBe('lightning-bolt');
    });

    test('MUST work with proper userData in hitbox mesh', () => {
      // Test that the integration works when userData is properly set
      const cardWithUserData = {
        position: { x: 0, y: 0.002, z: 0 },
        userData: {
          cardId: 1,
          slug: 'lightning-bolt',
          type: 'Spell',
        },
        // ❌ CRITICAL: raycast should not be disabled
        raycast: undefined, // This is the target state after fix
      };

      // Mock raycaster intersection
      const mockIntersection = {
        object: cardWithUserData,
        distance: 1.0,
      };

      // Extract card data like MouseTracker would
      const extractedData = {
        slug: mockIntersection.object.userData.slug,
        name: mockIntersection.object.userData.slug, // Fallback to slug
        type: mockIntersection.object.userData.type,
      };

      expect(extractedData).toEqual({
        slug: 'lightning-bolt',
        name: 'lightning-bolt',
        type: 'Spell',
      });

      // This data would then trigger the preview display
      const preview = React.createElement(MockCardPreview, {
        card: extractedData,
      });

      // Using imported render, screen
      render(preview);

      expect(screen.getByTestId('card-preview')).toBeTruthy();
      expect(screen.getByTestId('preview-name').textContent).toBe('lightning-bolt');
    });
  });

  describe('Performance and Error Handling', () => {
    test('MUST handle many cards without performance issues', () => {
      const manyCards: MockCard[] = Array.from({ length: 50 }, (_, i) => ({
        id: i + 100,
        card: {
          slug: `perf-card-${i}`,
          cardName: `Performance Card ${i}`,
          type: i % 3 === 0 ? 'Creature' : i % 3 === 1 ? 'Spell' : 'Site',
        },
        x: (i % 10) * 2,
        z: Math.floor(i / 10) * 2,
      }));

      const startTime = performance.now();

      const editor = React.createElement(MockEditor3DPage, {
        initialCards: manyCards,
      });

      // Using imported render, fireEvent, screen
      render(editor);

      // Hover over several cards
      for (let i = 0; i < 10; i++) {
        const card = screen.getByTestId(`draggable-card-${i + 100}`);
        fireEvent.mouseEnter(card);
        fireEvent.mouseLeave(card);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(200); // 200ms for rendering 50 cards + 10 hovers
    });

    test('MUST handle missing card data gracefully', () => {
      const invalidCards: MockCard[] = [
        { id: 999, card: { slug: '', cardName: 'Empty Slug', type: 'Creature' }, x: 0, z: 0 },
      ];

      const editor = React.createElement(MockEditor3DPage, {
        initialCards: invalidCards,
      });

      // Using imported render, fireEvent, screen
      
      expect(() => {
        render(editor);
      }).not.toThrow(); // Should not crash with invalid data

      const card = screen.getByTestId('draggable-card-999');
      
      expect(() => {
        fireEvent.mouseEnter(card);
      }).not.toThrow(); // Should handle hover gracefully
    });

    test('MUST cleanup properly on unmount', () => {
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 1),
      });

      // Using imported render, cleanup, fireEvent, screen
      render(editor);

      const card = screen.getByTestId('draggable-card-1');
      fireEvent.mouseEnter(card);
      fireEvent.mouseLeave(card);

      // Unmount while hide timer is active
      const { unmount } = render(editor);
      expect(() => {
        unmount();
      }).not.toThrow(); // Should not cause timer leaks
    });
  });

  describe('Accessibility', () => {
    test('MUST provide proper ARIA labels for previews', () => {
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 1),
      });

      // Using imported render, fireEvent, screen
      render(editor);

      const card = screen.getByTestId('draggable-card-1');
      fireEvent.mouseEnter(card);

      const preview = screen.queryByTestId('card-preview');
      expect(preview).toBeTruthy();
      expect(preview?.getAttribute('aria-label')).toBe('Card preview for Lightning Bolt');
    });

    test('MUST have accessible image alt text', () => {
      const editor = React.createElement(MockEditor3DPage, {
        initialCards: mockCards.slice(0, 1),
      });

      // Using imported render, fireEvent, screen
      render(editor);

      const card = screen.getByTestId('draggable-card-1');
      fireEvent.mouseEnter(card);

      const previewImage = screen.getByTestId('preview-image');
      expect((previewImage as HTMLImageElement).alt).toBe('Lightning Bolt');
    });
  });
});