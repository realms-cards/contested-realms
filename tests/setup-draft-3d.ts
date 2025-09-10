/**
 * Testing framework setup for Draft-3D Online Integration
 * Configures Jest and React Testing Library for draft-3d integration scenarios
 */

import '@testing-library/jest-dom';
import { vi } from 'vitest';
import type { Draft3DEventMap } from '@/types/draft-3d-events';
import type { OnlineDraftState, PlayerDraftState } from '@/types/draft-models';

// Mock Socket.io client for testing
const mockSocket = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};

// Mock SocketTransport for draft-3d testing
export class MockSocketTransport {
  private handlers: Map<string, Set<(payload: unknown) => void>> = new Map();
  public mockSocket = mockSocket;

  // Core transport methods
  async connect() { return Promise.resolve(); }
  disconnect() {}
  
  // Properly typed event handlers - accept any typed handler
  on<T = unknown>(event: string, handler: (payload: T) => void): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler as (payload: unknown) => void);
    return () => this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }

  // Draft-3D methods for testing
  sendCardPreview(event: Draft3DEventMap['draft:card:preview']) {
    mockSocket.emit('draft:card:preview', event);
  }

  sendStackInteraction(event: Draft3DEventMap['draft:stack:interact']) {
    mockSocket.emit('draft:stack:interact', event);
  }

  sendUIUpdate(event: Draft3DEventMap['draft:ui:update']) {
    mockSocket.emit('draft:ui:update', event);
  }

  // Draft compatibility methods
  makeDraftPick(config: { matchId: string; cardId: string; packIndex: number; pickNumber: number }) {
    mockSocket.emit('makeDraftPick', config);
  }

  startDraft(config: { matchId?: string; sessionId?: string; draftConfig?: { sets: string[]; packCount: number; playerCount: number } }) {
    mockSocket.emit('startDraft', config);
  }

  chooseDraftPack(config: { matchId?: string; packId?: string; playerId?: string; setChoice?: string; packIndex?: number; preferredSet?: string }) {
    mockSocket.emit('chooseDraftPack', config);
  }

  submitDeck(config: { deckData: unknown; playerId: string }) {
    mockSocket.emit('submitDeck', config);
  }

  // Test helper to simulate receiving events
  simulateEvent<K extends keyof Draft3DEventMap>(event: K, payload: Draft3DEventMap[K]): void;
  simulateEvent(event: string, payload: unknown): void;
  simulateEvent(event: string, payload: unknown) {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(payload));
    }
  }
}

// Mock draft session data for testing
export const createMockDraftSession = (overrides: Partial<OnlineDraftState> = {}): OnlineDraftState => ({
  session: {
    sessionId: 'test-session-001',
    players: ['player-1', 'player-2'],
    currentPack: 1,
    currentPick: 1,
    gamePhase: 'drafting',
    packContents: {
      'player-1': ['card-1', 'card-2', 'card-3'],
      'player-2': ['card-4', 'card-5', 'card-6'],
    },
    timeRemaining: 30,
    hostPlayerId: 'player-1',
    createdAt: Date.now() - 10000,
    updatedAt: Date.now(),
  },
  players: {
    'player-1': createMockPlayerState('player-1', 'Player One'),
    'player-2': createMockPlayerState('player-2', 'Player Two'),
  },
  cards: {},
  packs: {},
  previews: {},
  interactions: {},
  connections: {
    'player-1': {
      playerId: 'player-1',
      socketId: 'socket-1',
      isConnected: true,
      lastPingTime: Date.now(),
      connectionQuality: 'excellent',
      reconnectionAttempts: 0,
    },
    'player-2': {
      playerId: 'player-2',
      socketId: 'socket-2',
      isConnected: true,
      lastPingTime: Date.now(),
      connectionQuality: 'good',
      reconnectionAttempts: 0,
    },
  },
  sync: {
    lastSyncTimestamp: Date.now(),
    pendingOperations: [],
    conflictResolutionQueue: [],
    syncVersion: 1,
  },
  errors: [],
  ...overrides,
});

export const createMockPlayerState = (playerId: string, playerName: string): PlayerDraftState => ({
  playerId,
  sessionId: 'test-session-001',
  playerName,
  isConnected: true,
  currentCards: [],
  packPosition: 0,
  isReady: false,
  uiState: {
    cameraPosition: { x: 0, y: 5, z: 10 },
    cameraTarget: { x: 0, y: 0, z: 0 },
    selectedCardId: undefined,
    hoveredCardId: undefined,
    menuOpen: false,
    viewMode: '3d',
    zoomLevel: 1,
  },
  lastActivity: Date.now(),
  preferenceSettings: {
    autoPass: false,
    showTimers: true,
    cardPreviewDelay: 100,
    soundEnabled: true,
    animationSpeed: 'normal',
  },
});

// Mock card preview event
export const createMockCardPreviewEvent = (overrides = {}): Draft3DEventMap['draft:card:preview'] => ({
  sessionId: 'test-session-001',
  playerId: 'player-1',
  cardId: 'test-card-001',
  previewType: 'hover',
  position: { x: 0, y: 0.25, z: 0 },
  isActive: true,
  priority: 'low',
  timestamp: Date.now(),
  ...overrides,
});

// Mock stack interaction event
export const createMockStackInteractionEvent = (overrides = {}): Draft3DEventMap['draft:stack:interact'] => ({
  sessionId: 'test-session-001',
  playerId: 'player-1',
  interactionType: 'pick',
  cardIds: ['test-card-001'],
  fromStackId: 'pack-1',
  toStackId: 'player-1-picks',
  operationData: {
    targetPosition: { x: 0, y: 0.25, z: 0 },
    userInitiated: true,
    hasAnimation: true,
  },
  clientTimestamp: Date.now(),
  ...overrides,
});

// Mock UI update event
export const createMockUIUpdateEvent = (overrides = {}): Draft3DEventMap['draft:ui:update'] => ({
  sessionId: 'test-session-001',
  playerId: 'player-1',
  uiUpdates: [
    {
      type: 'card_position',
      data: { cardId: 'test-card-001', position: { x: 1, y: 0.25, z: 0 } },
      priority: 'low',
    },
  ],
  batchId: 'batch-001',
  ...overrides,
});

// Performance testing helpers
export const measureRenderTime = async (renderFn: () => Promise<void> | void): Promise<number> => {
  const start = performance.now();
  await renderFn();
  return performance.now() - start;
};

export const createPerformanceTestData = (playerCount: number, cardCount: number) => {
  const players: Record<string, PlayerDraftState> = {};
  const cards: Record<string, {
    cardId: string;
    currentOwner?: string;
    position: { x: number; y: number; z: number };
    isHovered: boolean;
    isPicked: boolean;
    isVisible: boolean;
    metadata: {
      rarity: string;
      manaCost: string;
      cardType: string;
    };
  }> = {};

  // Create test players
  for (let i = 1; i <= playerCount; i++) {
    const playerId = `player-${i}`;
    players[playerId] = createMockPlayerState(playerId, `Player ${i}`);
  }

  // Create test cards
  for (let i = 1; i <= cardCount; i++) {
    const cardId = `card-${i}`;
    cards[cardId] = {
      cardId,
      currentOwner: undefined,
      position: { x: (i % 10) - 5, y: 0.25, z: Math.floor(i / 10) - 5 },
      isHovered: false,
      isPicked: false,
      isVisible: true,
      metadata: {
        rarity: 'common',
        manaCost: '2',
        cardType: 'Creature',
      },
    };
  }

  return { players, cards };
};

// Network latency simulation
export const simulateNetworkLatency = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

// Test environment setup
export const setupTestEnvironment = () => {
  // Mock window.performance if not available
  if (typeof window !== 'undefined' && !window.performance) {
    window.performance = {
      now: () => Date.now(),
    } as Performance;
  }

  // Mock requestAnimationFrame for React Three Fiber
  global.requestAnimationFrame = vi.fn((cb) => {
    setTimeout(cb, 16); // ~60fps
    return 1;
  });

  // Mock cancelAnimationFrame
  global.cancelAnimationFrame = vi.fn();

  // Mock WebGL context for Three.js
  const mockWebGLContext = {
    getExtension: vi.fn(),
    getParameter: vi.fn(),
    createShader: vi.fn(),
    createProgram: vi.fn(),
    // Add other WebGL methods as needed
  };

  HTMLCanvasElement.prototype.getContext = vi.fn((contextType) => {
    if (contextType === 'webgl' || contextType === 'webgl2') {
      return mockWebGLContext;
    }
    return null;
  });
};

// Clean up after tests
export const cleanupTestEnvironment = () => {
  vi.clearAllMocks();
  mockSocket.emit.mockClear();
  mockSocket.on.mockClear();
  mockSocket.off.mockClear();
};

// Auto-setup for all tests
beforeEach(() => {
  setupTestEnvironment();
});

afterEach(() => {
  cleanupTestEnvironment();
});

export {
  mockSocket,
  vi,
};