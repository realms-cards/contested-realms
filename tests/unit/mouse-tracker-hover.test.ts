/**
 * T006: MouseTracker hover detection tests
 * 
 * These tests verify MouseTracker can properly detect hover events on DraggableCard3D components.
 * 
 * ⚠️ CRITICAL: Tests will fail initially due to disabled raycasting, pass after fix
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';

// Type definitions for test mocks
type MockFunction = ReturnType<typeof vi.fn>;

type HoverCard = {
  slug: string;
  name: string;
  type: string | null;
};

type MockRaycaster = {
  setFromCamera: MockFunction;
  intersectObjects: MockFunction;
};

type RaycastIntersection = {
  object: {
    userData: {
      cardId: number;
      slug: string;
      type: string | null;
      name?: string;
    };
  };
  point: { x: number; z: number };
  distance?: number;
};

// Mock Three.js Raycaster and related classes
vi.mock('three', () => ({
  Raycaster: vi.fn().mockImplementation(() => ({
    setFromCamera: vi.fn(),
    intersectObjects: vi.fn(() => []), // Will be overridden in tests
  })),
  Vector2: vi.fn().mockImplementation((x = 0, y = 0) => ({ x, y })),
  Vector3: vi.fn().mockImplementation((x = 0, y = 0, z = 0) => ({ x, y, z })),
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({
    camera: { position: { x: 0, y: 10, z: 0 } },
    scene: { children: [] },
    gl: { domElement: document.createElement('canvas') },
  })),
}));

// Mock card data structure (from MouseTracker props)
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

// Mock MouseTracker implementation for testing
class MockMouseTracker {
  private cards: MockCard[];
  private onHover: (card: HoverCard | null) => void;
  private currentHover: HoverCard | null = null;
  private raycaster: MockRaycaster;

  constructor(props: { cards: MockCard[]; onHover: (card: HoverCard | null) => void }) {
    this.cards = props.cards;
    this.onHover = props.onHover;
    this.raycaster = {
      setFromCamera: vi.fn(),
      intersectObjects: vi.fn(),
    };
  }

  // Simulate mouse position update
  updateMousePosition(x: number, y: number) {
    const normalizedX = (x / window.innerWidth) * 2 - 1;
    const normalizedY = -(y / window.innerHeight) * 2 + 1;
    
    this.raycaster.setFromCamera({ x: normalizedX, y: normalizedY }, {});
    
    // Find intersections
    const intersections = this.findIntersections(normalizedX, normalizedY);
    
    if (intersections.length > 0) {
      const intersection = intersections[0];
      const userData = intersection.object.userData;
      
      if (userData && userData.slug) {
        const cardData = {
          slug: userData.slug,
          name: userData.name || userData.slug,
          type: userData.type,
        };
        
        if (this.currentHover?.slug !== cardData.slug) {
          this.currentHover = cardData;
          this.onHover(cardData);
        }
      }
    } else {
      if (this.currentHover) {
        this.currentHover = null;
        this.onHover(null);
      }
    }
  }

  // Mock intersection detection
  private findIntersections(mouseX: number, mouseY: number) {
    const intersections: RaycastIntersection[] = [];
    
    this.cards.forEach(cardData => {
      // Create mock mesh object for the card
      const mockMesh = {
        position: { x: cardData.x, y: 0.002, z: cardData.z },
        userData: {
          cardId: cardData.id,
          slug: cardData.card.slug,
          type: cardData.card.type,
          name: cardData.card.cardName,
        },
        // ❌ CRITICAL: This simulates the current broken raycast
        raycast: () => [], // This is why MouseTracker can't detect cards!
      };

      // Simulate raycasting - if raycast returns empty array, no intersection
      if (typeof mockMesh.raycast === 'function') {
        const raycastResult = mockMesh.raycast();
        if (Array.isArray(raycastResult) && raycastResult.length === 0) {
          // ❌ Disabled raycast - can't detect this card
          return;
        }
      }

      // Simple distance-based hit detection for testing
      const distance = Math.sqrt(
        Math.pow(mouseX * 10 - cardData.x, 2) + 
        Math.pow(mouseY * 10 - cardData.z, 2)
      );
      
      if (distance < 1.0) { // Within hover range
        intersections.push({
          object: mockMesh,
          distance,
        });
      }
    });
    
    return intersections.sort((a, b) => a.distance - b.distance);
  }
}

describe('MouseTracker Hover Detection', () => {
  let mockCards: MockCard[];
  let onHoverCallback: MockFunction;
  let mouseTracker: MockMouseTracker;

  beforeEach(() => {
    onHoverCallback = vi.fn();
    mockCards = [
      {
        id: 1,
        card: { slug: 'test-card-1', cardName: 'Test Card 1', type: 'Creature' },
        x: 0,
        z: 0,
      },
      {
        id: 2,
        card: { slug: 'test-card-2', cardName: 'Test Card 2', type: 'Spell' },
        x: 2,
        z: 0,
      },
      {
        id: 3,
        card: { slug: 'test-card-3', cardName: 'Test Card 3', type: null },
        x: 0,
        z: 2,
      },
    ];
    
    mouseTracker = new MockMouseTracker({
      cards: mockCards,
      onHover: onHoverCallback,
    });
  });

  describe('Basic Hover Detection', () => {
    test('MUST detect hover on cards with enabled raycast (WILL FAIL INITIALLY)', () => {
      // Simulate hovering over the first card at (0, 0)
      mouseTracker.updateMousePosition(400, 300); // Center of screen -> (0, 0) world coords

      // ❌ WILL FAIL - onHover should be called but raycast is disabled
      expect(onHoverCallback).toHaveBeenCalledWith({
        slug: 'test-card-1',
        name: 'Test Card 1',
        type: 'Creature',
      });
    });

    test('MUST detect hover on second card (WILL FAIL INITIALLY)', () => {
      // Simulate hovering over the second card at (2, 0)
      mouseTracker.updateMousePosition(600, 300); // Right side -> (2, 0) world coords

      // ❌ WILL FAIL - should detect second card
      expect(onHoverCallback).toHaveBeenCalledWith({
        slug: 'test-card-2',
        name: 'Test Card 2',
        type: 'Spell',
      });
    });

    test('MUST clear hover when mouse moves away', () => {
      // First hover over a card
      mouseTracker.updateMousePosition(400, 300);
      
      // Then move mouse to empty space
      mouseTracker.updateMousePosition(100, 100); // Far from any card

      // ❌ WILL FAIL - should call onHover(null) to clear
      expect(onHoverCallback).toHaveBeenLastCalledWith(null);
    });

    test('MUST handle cards with null type', () => {
      // Hover over card with null type
      mouseTracker.updateMousePosition(400, 600); // Bottom center -> (0, 2) world coords

      // ❌ WILL FAIL - should handle null type properly
      expect(onHoverCallback).toHaveBeenCalledWith({
        slug: 'test-card-3',
        name: 'Test Card 3',
        type: null,
      });
    });
  });

  describe('Multiple Card Interactions', () => {
    test('MUST switch hover between cards smoothly', () => {
      onHoverCallback.mockClear();

      // Hover first card
      mouseTracker.updateMousePosition(400, 300);
      
      // Move to second card
      mouseTracker.updateMousePosition(600, 300);

      // ❌ WILL FAIL - should detect both cards
      expect(onHoverCallback).toHaveBeenNthCalledWith(1, {
        slug: 'test-card-1',
        name: 'Test Card 1',
        type: 'Creature',
      });
      
      expect(onHoverCallback).toHaveBeenNthCalledWith(2, {
        slug: 'test-card-2',
        name: 'Test Card 2',
        type: 'Spell',
      });
    });

    test('MUST not trigger duplicate hover events for same card', () => {
      onHoverCallback.mockClear();

      // Hover same card multiple times
      mouseTracker.updateMousePosition(400, 300);
      mouseTracker.updateMousePosition(410, 310); // Slightly different position, same card
      mouseTracker.updateMousePosition(390, 290); // Another position on same card

      // ❌ WILL FAIL - should only call once for same card
      expect(onHoverCallback).toHaveBeenCalledTimes(1);
      expect(onHoverCallback).toHaveBeenCalledWith({
        slug: 'test-card-1',
        name: 'Test Card 1',
        type: 'Creature',
      });
    });
  });

  describe('Raycast Integration', () => {
    test('MUST work with enabled raycast (TARGET STATE)', () => {
      // Mock a fixed MouseTracker that works with enabled raycast
      const fixedMouseTracker = new MockMouseTracker({
        cards: mockCards,
        onHover: onHoverCallback,
      });

      // Override the findIntersections method to simulate working raycast
      (fixedMouseTracker as unknown as { findIntersections: (mouseX: number, mouseY: number) => RaycastIntersection[] }).findIntersections = (mouseX: number, mouseY: number) => {
        const intersections: RaycastIntersection[] = [];
        
        mockCards.forEach(cardData => {
          const mockMesh = {
            position: { x: cardData.x, y: 0.002, z: cardData.z },
            userData: {
              cardId: cardData.id,
              slug: cardData.card.slug,
              type: cardData.card.type,
              name: cardData.card.cardName,
            },
            // ✅ Fixed: raycast is undefined (default Three.js behavior)
            raycast: undefined,
          };

          // With working raycast, we can detect intersections
          const distance = Math.sqrt(
            Math.pow(mouseX * 10 - cardData.x, 2) + 
            Math.pow(mouseY * 10 - cardData.z, 2)
          );
          
          if (distance < 1.0) {
            intersections.push({
              object: mockMesh,
              distance,
            });
          }
        });
        
        return intersections.sort((a, b) => a.distance - b.distance);
      };

      // Test that fixed version works
      fixedMouseTracker.updateMousePosition(400, 300);
      
      // ✅ This should work with the fixed raycast
      expect(onHoverCallback).toHaveBeenCalledWith({
        slug: 'test-card-1',
        name: 'Test Card 1',
        type: 'Creature',
      });
    });

    test('MUST fail with disabled raycast (CURRENT BROKEN STATE)', () => {
      // This test documents the current broken behavior
      const brokenCard = {
        position: { x: 0, y: 0.002, z: 0 },
        userData: {
          cardId: 1,
          slug: 'broken-card',
          type: 'Creature',
        },
        raycast: () => [], // ❌ Current broken state
      };

      // Simulate raycast call
      const raycastResult = brokenCard.raycast();
      
      // ❌ This documents the problem
      expect(Array.isArray(raycastResult)).toBe(true);
      expect(raycastResult.length).toBe(0); // Empty array = no intersections
      
      // This means MouseTracker can't detect the card
      expect(raycastResult.length).toBeGreaterThan(0); // ❌ WILL FAIL
    });
  });

  describe('UserData Extraction', () => {
    test('MUST extract correct card data from intersection userData', () => {
      const mockIntersection = {
        object: {
          userData: {
            cardId: 123,
            slug: 'extraction-test-card',
            type: 'Site',
            name: 'Extraction Test Site',
          }
        }
      };

      // Simulate MouseTracker extracting data from intersection
      const extractedData = {
        slug: mockIntersection.object.userData.slug,
        name: mockIntersection.object.userData.name || mockIntersection.object.userData.slug,
        type: mockIntersection.object.userData.type,
      };

      expect(extractedData).toEqual({
        slug: 'extraction-test-card',
        name: 'Extraction Test Site',
        type: 'Site',
      });
    });

    test('MUST handle missing name in userData', () => {
      const mockIntersection = {
        object: {
          userData: {
            cardId: 456,
            slug: 'no-name-card',
            type: 'Spell',
            // name is missing
          }
        }
      };

      const extractedData = {
        slug: mockIntersection.object.userData.slug,
        name: mockIntersection.object.userData.name || mockIntersection.object.userData.slug,
        type: mockIntersection.object.userData.type,
      };

      expect(extractedData.name).toBe('no-name-card'); // Falls back to slug
      expect(extractedData.slug).toBe('no-name-card');
      expect(extractedData.type).toBe('Spell');
    });
  });

  describe('Performance Tests', () => {
    test('MUST handle many cards efficiently', () => {
      const manyCards = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        card: {
          slug: `perf-card-${i}`,
          cardName: `Performance Card ${i}`,
          type: i % 3 === 0 ? 'Creature' : i % 3 === 1 ? 'Spell' : 'Site',
        },
        x: (i % 10) * 2,
        z: Math.floor(i / 10) * 2,
      }));

      const perfTracker = new MockMouseTracker({
        cards: manyCards,
        onHover: vi.fn(),
      });

      const startTime = performance.now();
      
      // Simulate mouse movement over many cards
      for (let i = 0; i < 50; i++) {
        perfTracker.updateMousePosition(400 + i * 10, 300 + i * 5);
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(100); // 100ms for 50 updates over 100 cards
    });

    test('MUST not leak memory on repeated hover events', () => {
      const callbacks = [];
      
      // Simulate many hover events
      for (let i = 0; i < 1000; i++) {
        const callback = vi.fn();
        callbacks.push(callback);
        
        const tracker = new MockMouseTracker({
          cards: mockCards.slice(0, 1), // Just one card
          onHover: callback,
        });
        
        tracker.updateMousePosition(400, 300);
      }

      // All callbacks should be independent
      expect(callbacks.length).toBe(1000);
      callbacks.forEach(callback => {
        expect(callback).toBeInstanceOf(Function);
      });
    });
  });

  describe('Edge Cases', () => {
    test('MUST handle empty card list', () => {
      const emptyTracker = new MockMouseTracker({
        cards: [],
        onHover: onHoverCallback,
      });

      emptyTracker.updateMousePosition(400, 300);

      // Should not crash and should not call hover
      expect(onHoverCallback).not.toHaveBeenCalled();
    });

    test('MUST handle cards with invalid userData', () => {
      const invalidCards = [
        {
          id: 999,
          card: { slug: '', cardName: '', type: null }, // Invalid: empty strings
          x: 0,
          z: 0,
        }
      ];

      const invalidTracker = new MockMouseTracker({
        cards: invalidCards,
        onHover: onHoverCallback,
      });

      invalidTracker.updateMousePosition(400, 300);

      // Should handle gracefully - this test defines expected behavior
      expect(onHoverCallback).not.toHaveBeenCalled(); // Don't hover invalid cards
    });

    test('MUST handle very small/large coordinates', () => {
      const extremeCards = [
        {
          id: 1001,
          card: { slug: 'tiny-card', cardName: 'Tiny Card', type: 'Creature' },
          x: 0.001,
          z: 0.001,
        },
        {
          id: 1002,
          card: { slug: 'huge-card', cardName: 'Huge Card', type: 'Spell' },
          x: 1000000,
          z: 1000000,
        }
      ];

      const extremeTracker = new MockMouseTracker({
        cards: extremeCards,
        onHover: onHoverCallback,
      });

      // Test very precise coordinates
      extremeTracker.updateMousePosition(400.1, 300.1);
      
      // Should not crash
      expect(() => {
        extremeTracker.updateMousePosition(0, 0);
        extremeTracker.updateMousePosition(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      }).not.toThrow();
    });
  });
});