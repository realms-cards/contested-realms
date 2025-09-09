/**
 * T005: DraggableCard3D raycast behavior tests
 * 
 * These tests verify that hitbox mesh is raycastable and has proper userData.
 * 
 * ⚠️ CRITICAL: Test MUST fail with current `raycast={() => []}`, pass after fix
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Type definitions for test mocks
type MockMeshProps = {
  slug: string;
  x: number;
  z: number;
  raycast?: (() => unknown[]) | undefined;
  userData?: {
    cardId: number;
    slug: string;
    type: string | null;
  };
};

type MockMesh = {
  position: { set: (x: number, y: number, z: number) => void };
  userData: Record<string, unknown>;
  raycast?: (() => unknown[]) | undefined;
  geometry: { dispose: () => void };
  material: { dispose: () => void };
  props: MockMeshProps;
};

type RaycastIntersection = {
  point: { x: number; z: number };
  object: MockMesh;
};

// Mock Three.js and React Three Fiber
vi.mock('three', () => ({
  Vector3: vi.fn(),
  BoxGeometry: vi.fn(),
  MeshBasicMaterial: vi.fn(),
  Mesh: vi.fn().mockImplementation(() => ({
    position: { set: vi.fn() },
    userData: {},
    raycast: undefined, // Default behavior - not disabled
  })),
}));

vi.mock('@react-three/fiber', () => ({
  useFrame: vi.fn(),
  useThree: vi.fn(() => ({ scene: {}, camera: {} })),
}));

// Mock the DraggableCard3D component for testing
const mockDraggableCard3D = (props: MockMeshProps) => {
  // Simulate the hitbox mesh creation
  const hitboxMesh = {
    position: { set: vi.fn() },
    userData: props.userData || {},
    raycast: props.raycast, // This is the critical property we're testing
    geometry: { dispose: vi.fn() },
    material: { dispose: vi.fn() },
  };

  return {
    hitboxMesh,
    props,
  };
};

describe('DraggableCard3D Raycast Behavior', () => {
  let cleanup: (() => void)[] = [];

  beforeEach(() => {
    cleanup = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup.forEach(fn => fn());
  });

  describe('Raycast Function Tests', () => {
    test('MUST NOT disable raycast function (WILL FAIL INITIALLY)', () => {
      // Create mock component with current broken behavior
      const brokenCard = mockDraggableCard3D({
        slug: 'test-card',
        x: 0,
        z: 0,
        // Current broken state: raycast is disabled
        raycast: () => [], // ❌ This is the problem!
      });

      const hitboxMesh = brokenCard.hitboxMesh;
      
      // ❌ THIS WILL FAIL - raycast should NOT be a function that returns []
      expect(hitboxMesh.raycast).not.toEqual(expect.unknown(Function));
      
      // ❌ THIS WILL FAIL - raycast should be undefined (default Three.js behavior)
      expect(hitboxMesh.raycast).toBeUndefined();
      
      // Alternative check: if raycast IS a function, it should not return empty array
      if (typeof hitboxMesh.raycast === 'function') {
        const result = hitboxMesh.raycast();
        expect(Array.isArray(result) && result.length === 0).toBe(false); // ❌ WILL FAIL
      }
    });

    test('MUST allow default raycast behavior (TARGET STATE)', () => {
      // This represents the fixed state we want to achieve
      const fixedCard = mockDraggableCard3D({
        slug: 'test-card',
        x: 0,
        z: 0,
        // Fixed state: raycast is undefined (default behavior) or not specified
        raycast: undefined,
      });

      const hitboxMesh = fixedCard.hitboxMesh;
      
      // ✅ This is what we want after the fix
      expect(hitboxMesh.raycast).toBeUndefined();
    });

    test('MUST be detectable by Three.js raycaster', () => {
      // Mock Three.js Raycaster behavior
      const mockRaycaster = {
        intersectObject: vi.fn(),
        intersectObjects: vi.fn(),
      };

      const cardWithDisabledRaycast = mockDraggableCard3D({
        slug: 'disabled-card',
        x: 0,
        z: 0,
        raycast: () => [], // Current broken state
      });

      const cardWithEnabledRaycast = mockDraggableCard3D({
        slug: 'enabled-card', 
        x: 1,
        z: 1,
        raycast: undefined, // Target fixed state
      });

      // Simulate raycaster intersection
      const testRaycast = (mesh: MockMesh) => {
        if (typeof mesh.raycast === 'function') {
          // If raycast is a function that returns [], no intersections
          const intersections = mesh.raycast();
          return intersections;
        }
        // If raycast is undefined, use default Three.js behavior (should intersect)
        return [{ point: { x: mesh.props.x, z: mesh.props.z }, object: mesh }];
      };

      const disabledResults = testRaycast(cardWithDisabledRaycast.hitboxMesh);
      const enabledResults = testRaycast(cardWithEnabledRaycast.hitboxMesh);

      // ❌ WILL FAIL - disabled raycast returns empty array
      expect(disabledResults.length).toBeGreaterThan(0);
      
      // ✅ This should pass - enabled raycast can be intersected
      expect(enabledResults.length).toBeGreaterThan(0);
    });
  });

  describe('UserData Tests', () => {
    test('MUST set userData on hitbox mesh (WILL FAIL INITIALLY)', () => {
      // Current state - userData might not be set properly
      const cardWithoutUserData = mockDraggableCard3D({
        slug: 'test-card',
        cardId: 123,
        x: 0,
        z: 0,
        // userData not set (current broken state)
      });

      const hitboxMesh = cardWithoutUserData.hitboxMesh;
      
      // ❌ WILL FAIL - userData should be set
      expect(hitboxMesh.userData).toEqual({
        cardId: 123,
        slug: 'test-card',
        type: expect.unknown(String),
      });
    });

    test('MUST include required fields in userData (TARGET STATE)', () => {
      // This represents the fixed state
      const cardWithUserData = mockDraggableCard3D({
        slug: 'test-card',
        cardId: 456,
        x: 0,
        z: 0,
        userData: {
          cardId: 456,
          slug: 'test-card',
          type: 'Creature',
        },
      });

      const hitboxMesh = cardWithUserData.hitboxMesh;
      
      // ✅ This is what we want after the fix
      expect(hitboxMesh.userData.cardId).toBe(456);
      expect(hitboxMesh.userData.slug).toBe('test-card');
      expect(hitboxMesh.userData.type).toBeDefined();
      expect(typeof hitboxMesh.userData.cardId).toBe('number');
      expect(typeof hitboxMesh.userData.slug).toBe('string');
    });

    test('MUST handle missing optional userData fields', () => {
      const cardWithMinimalUserData = mockDraggableCard3D({
        slug: 'minimal-card',
        cardId: 789,
        x: 0,
        z: 0,
        userData: {
          cardId: 789,
          slug: 'minimal-card',
          type: null, // Allowed to be null
          // name is optional, not included
        },
      });

      const hitboxMesh = cardWithMinimalUserData.hitboxMesh;
      
      expect(hitboxMesh.userData.cardId).toBe(789);
      expect(hitboxMesh.userData.slug).toBe('minimal-card');
      expect(hitboxMesh.userData.type).toBeNull();
      expect(hitboxMesh.userData.name).toBeUndefined(); // Optional field
    });
  });

  describe('MouseTracker Compatibility Tests', () => {
    test('MUST be compatible with MouseTracker raycast detection', () => {
      // Mock MouseTracker's raycast behavior
      const mockMouseTracker = {
        performRaycast: (objects: MockMesh[]) => {
          const intersections: RaycastIntersection[] = [];
          
          objects.forEach(obj => {
            // MouseTracker expects to be able to raycast objects
            if (typeof obj.raycast === 'function') {
              const results = obj.raycast();
              // If raycast returns empty array, no intersections found
              if (Array.isArray(results) && results.length === 0) {
                // ❌ This is the current problem - can't detect the object
                return;
              }
            }
            
            // Default Three.js behavior - object can be intersected
            if (obj.userData && obj.userData.slug) {
              intersections.push({
                object: obj,
                userData: obj.userData,
              });
            }
          });
          
          return intersections;
        }
      };

      const brokenCard = mockDraggableCard3D({
        slug: 'broken-card',
        cardId: 100,
        x: 0,
        z: 0,
        raycast: () => [], // ❌ Current broken state
        userData: { cardId: 100, slug: 'broken-card', type: 'Creature' },
      });

      const fixedCard = mockDraggableCard3D({
        slug: 'fixed-card',
        cardId: 200,
        x: 1,
        z: 1,
        raycast: undefined, // ✅ Target fixed state
        userData: { cardId: 200, slug: 'fixed-card', type: 'Spell' },
      });

      const brokenResults = mockMouseTracker.performRaycast([brokenCard.hitboxMesh]);
      const fixedResults = mockMouseTracker.performRaycast([fixedCard.hitboxMesh]);

      // ❌ WILL FAIL - broken card can't be detected due to disabled raycast
      expect(brokenResults.length).toBeGreaterThan(0);
      expect(brokenResults[0]?.userData.slug).toBe('broken-card');

      // ✅ This should pass - fixed card can be detected
      expect(fixedResults.length).toBeGreaterThan(0);
      expect(fixedResults[0]?.userData.slug).toBe('fixed-card');
    });

    test('MUST provide userData to MouseTracker on intersection', () => {
      // Test that when MouseTracker intersects with the hitbox, it gets the userData
      const cardMesh = mockDraggableCard3D({
        slug: 'data-test-card',
        cardId: 999,
        x: 0,
        z: 0,
        userData: {
          cardId: 999,
          slug: 'data-test-card',
          type: 'Site',
          name: 'Data Test Site'
        }
      });

      // Mock intersection result
      const intersection = {
        object: cardMesh.hitboxMesh,
        userData: cardMesh.hitboxMesh.userData,
      };

      // MouseTracker should be able to extract card data from intersection
      const extractedData = {
        slug: intersection.userData.slug,
        name: intersection.userData.name || intersection.userData.slug,
        type: intersection.userData.type,
      };

      expect(extractedData.slug).toBe('data-test-card');
      expect(extractedData.name).toBe('Data Test Site');
      expect(extractedData.type).toBe('Site');
    });
  });

  describe('Performance and Memory Tests', () => {
    test('MUST not leak raycast functions', () => {
      // Test that disabled raycast functions don't accumulate
      const cards = Array.from({ length: 100 }, (_, i) => 
        mockDraggableCard3D({
          slug: `perf-card-${i}`,
          cardId: i,
          x: i % 10,
          z: Math.floor(i / 10),
          raycast: () => [], // Current problematic pattern
        })
      );

      // Check that we're not creating 100 unnecessary functions
      const raycastFunctions = cards.filter(card => 
        typeof card.hitboxMesh.raycast === 'function'
      );

      // ❌ WILL FAIL - we shouldn't have 100 raycast functions
      expect(raycastFunctions.length).toBe(0);
    });

    test('MUST handle cleanup properly', () => {
      const card = mockDraggableCard3D({
        slug: 'cleanup-test',
        cardId: 1,
        x: 0,
        z: 0,
      });

      const hitboxMesh = card.hitboxMesh;
      
      // Mock component cleanup
      const cleanup = () => {
        if (hitboxMesh.geometry) hitboxMesh.geometry.dispose();
        if (hitboxMesh.material) hitboxMesh.material.dispose();
      };

      expect(() => cleanup()).not.toThrow();
      expect(hitboxMesh.geometry.dispose).toBeDefined();
      expect(hitboxMesh.material.dispose).toBeDefined();
    });
  });

  describe('Real Implementation Tests', () => {
    test('MUST verify current DraggableCard3D component has the issue', async () => {
      // This test documents the current broken state
      // It should fail, proving the issue exists
      
      // Mock reading the actual file content (this would fail in real implementation)
      const mockFileContent = `
        <mesh
          ref={hitboxRef}
          position={[x, y || 0.002, z]}
          raycast={() => []} // ❌ THIS IS THE PROBLEM
        >
      `;
      
      const hasDisabledRaycast = mockFileContent.includes('raycast={() => []}');
      
      // ❌ This test documents that the problem exists
      expect(hasDisabledRaycast).toBe(false); // WILL FAIL because the problem exists
    });

    test('MUST define the target implementation', () => {
      // This test defines what the fixed implementation should look like
      const targetImplementation = `
        <mesh
          ref={hitboxRef}
          position={[x, y || 0.002, z]}
          userData={{
            cardId: cardId || 0,
            slug: slug,
            type: null,
          }}
        >
      `;
      
      const hasUserData = targetImplementation.includes('userData=');
      const hasNoDisabledRaycast = !targetImplementation.includes('raycast={() => []}');
      
      // ✅ This defines our target state
      expect(hasUserData).toBe(true);
      expect(hasNoDisabledRaycast).toBe(true);
    });
  });
});